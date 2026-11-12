"""Official SDK adapter. Lazy, backend-only, fail-closed target authorization, no startup calls."""

import json
import os
import re
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit

from app.embedding_assets import SIGNATURE
from app.embedding_math import checked_vector
from app.tokenization import MODEL_ID, REVISION
from app.vector_contracts import Target, VectorError, records_checked


def plain(value):
    return value.to_dict() if hasattr(value, "to_dict") else value


def trusted_host(host: str) -> str:
    try:
        parsed = urlsplit(host if "://" in host else "https://" + host)
        port = parsed.port
    except ValueError:
        raise VectorError("untrusted_index_host", 409) from None
    if (
        parsed.scheme != "https"
        or parsed.username
        or parsed.password
        or port not in (None, 443)
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
        or not re.fullmatch(
            r"[a-z0-9-]+\.svc(?:\.[a-z0-9-]+)*\.pinecone\.io", parsed.hostname or ""
        )
    ):
        raise VectorError("untrusted_index_host", 409)
    return "https://" + parsed.hostname


class LiveAuthorization:
    def check(self, action: str, target: Target, ids: list[str], info: dict):
        try:
            path = os.getenv("PVL_LIVE_AUTHORIZATION_FILE", "")
            if not path:
                raise ValueError("no approval")
            approval = json.loads(Path(path).read_text(encoding="utf-8"))
            if not isinstance(approval, dict):
                raise ValueError("invalid approval")
            expected_project = os.getenv("PVL_PINECONE_PROJECT", "")
            if (
                not isinstance(approval.get("actions"), list)
                or any(
                    item not in ("create_index", "upsert", "delete") for item in approval["actions"]
                )
                or not isinstance(approval.get("record_ids", []), list)
                or any(not isinstance(item, str) for item in approval.get("record_ids", []))
                or not expected_project
                or approval["project"] != expected_project
                or approval["index"] != target.index
                or approval["namespace"] != target.namespace
                or approval["cloud"] != info["cloud"]
                or approval["region"] != info["region"]
                or action not in approval["actions"]
                or approval["plan_quota_acknowledged"] is not True
                or datetime.fromisoformat(approval["expires_at"]) <= datetime.now(UTC)
            ):
                raise ValueError("target mismatch")
            if action != "create_index" and (
                trusted_host(approval["index_host"]) != info["host"]
                or not set(ids) <= set(approval["record_ids"])
            ):
                raise ValueError("IDs/host mismatch")
        except (KeyError, ValueError, TypeError, OSError):
            raise VectorError("live_authorization_required_for_exact_target_ids", 403) from None


class PineconeLiveAdapter:
    mode = "live"

    def __init__(self, client=None, authorization=None):
        self._client = client
        self.authorization = authorization or LiveAuthorization()

    @property
    def client(self):
        if self._client is None:
            if os.getenv("PVL_DISABLE_CLOUD") == "1":
                raise VectorError("cloud_disabled_in_this_process", 403)
            key = os.getenv("PINECONE_API_KEY", "")
            if not key:
                raise VectorError("server_api_key_not_configured", 503)
            from pinecone import Pinecone, RetryConfig

            self._client = Pinecone(api_key=key, timeout=5, retry_config=RetryConfig(max_retries=0))
        return self._client

    def close(self):
        if self._client is not None:
            self._client.close()

    @staticmethod
    def call(operation):
        try:
            return operation()
        except VectorError:
            raise
        except Exception as error:
            status = getattr(error, "status_code", None) or getattr(error, "status", None) or 502
            if not isinstance(status, int):
                status = 502
            retryable = status in (408, 429, 500, 502, 503, 504)
            raise VectorError(f"pinecone_{status}", status, retryable) from None

    @staticmethod
    def description(raw):
        data = plain(raw)
        fields = data.get("schema", {}).get("fields", {})
        # Reserved _values is the SDK 10.x BYOV Vectors API shape, not a document schema.
        vector = fields.get("_values", {})
        legacy = not fields and data.get("vector_type") == "dense" and not data.get("embed")
        dimension = data.get("dimension") if legacy else vector.get("dimension")
        metric = data.get("metric") if legacy else vector.get("metric")
        deployment = data.get("deployment") or data.get("spec", {}).get("serverless", {})
        ready = data.get("status", {}).get("ready") is True
        compatible = (
            (legacy or set(fields) == {"_values"} and vector.get("type") == "dense_vector")
            and dimension == 384
            and metric == "cosine"
            and not data.get("embed")
            and ready
            and deployment.get("cloud") in ("aws", "gcp", "azure")
            and bool(deployment.get("region"))
            and deployment.get("deployment_type", "managed") == "managed"
        )
        host = trusted_host(data["host"]) if data.get("host") else None
        return dict(
            name=data["name"],
            dimension=dimension,
            metric=metric,
            ready=ready,
            compatible=bool(compatible and host),
            host=host,
            cloud=deployment.get("cloud"),
            region=deployment.get("region"),
            project=os.getenv("PVL_PINECONE_PROJECT", ""),
            project_source="server configuration; verify API-key project in console",
            mode="live",
            data_origin="Pinecone SDK control plane",
        )

    def indexes(self):
        def read():
            result = []
            for item in self.client.indexes.list(limit=50):
                result.append(self.description(item))
                if len(result) == 100:
                    break
            return result

        return self.call(read)

    def describe(self, name):
        return self.call(lambda: self.description(self.client.indexes.describe(name)))

    def valid(self, name):
        info = self.describe(name)
        if not info["compatible"]:
            raise VectorError("index_must_be_ready_dense_byov_384_cosine", 409)
        return info

    def create(self, name, cloud, region):
        target = Target(mode="live", index=name)
        info = dict(cloud=cloud, region=region)
        self.authorization.check("create_index", target, [], info)
        if any(index["name"] == name for index in self.indexes()):
            raise VectorError("duplicate_index", 409)
        return self.call(
            lambda: self.description(
                self.client.indexes.create(
                    name=name,
                    schema={
                        "fields": {
                            "_values": {
                                "type": "dense_vector",
                                "dimension": 384,
                                "metric": "cosine",
                            }
                        }
                    },
                    deployment={"deployment_type": "managed", "cloud": cloud, "region": region},
                    timeout=-1,
                )
            )
        )

    def data_call(self, name, operation):
        info = self.valid(name)
        client = self.client.index(host=info["host"])
        try:
            return self.call(lambda: operation(client))
        finally:
            client.close()

    def namespaces(self, name):
        data = plain(self.data_call(name, lambda client: client.describe_index_stats(timeout=5)))
        return [
            dict(namespace=name, count=stats["vector_count"], exists=True)
            for name, stats in sorted(data.get("namespaces", {}).items())
        ][:100]

    def upsert(self, target, records):
        records_checked(records)
        if any(r["metadata"]["embedding_mode"] != "e5" for r in records):
            raise VectorError("fixture_vectors_never_uploaded_live", 409)
        if any(
            r["metadata"].get("model_signature") != SIGNATURE
            or r["metadata"].get("model_revision") != REVISION
            or r["metadata"].get("model_id") != MODEL_ID
            for r in records
        ):
            raise VectorError("live_model_signature_mismatch", 409)
        info = self.valid(target.index)
        self.authorization.check("upsert", target, [r["id"] for r in records], info)
        expected = {r["id"]: r for r in records}
        existing = self.fetch(target, list(expected))
        for old in existing:
            new = expected[old["id"]]
            if any(old["metadata"].get(k) != v for k, v in new["metadata"].items()) or any(
                abs(a - b) > 2e-5 for a, b in zip(old["values"], new["values"], strict=True)
            ):
                raise VectorError("id_collision", 409)
        result = plain(
            self.data_call(
                target.index,
                lambda c: c.upsert(
                    vectors=records, namespace=target.namespace, timeout=5, show_progress=False
                ),
            )
        )
        if result.get("upserted_count") != len(records):
            raise VectorError("partial_upsert_response", 502, True)

    def fetch(self, target, ids):
        result = plain(
            self.data_call(
                target.index, lambda c: c.fetch(ids=ids, namespace=target.namespace, timeout=5)
            )
        )
        records = []
        for identifier in ids:
            if identifier in result.get("vectors", {}):
                item = result["vectors"][identifier]
                values = list(item["values"])
                checked_vector(values)
                records.append(
                    dict(id=identifier, values=values, metadata=item.get("metadata") or {})
                )
        return records

    def list_ids(self, target, cursor=None, limit=25):
        result = plain(
            self.data_call(
                target.index,
                lambda c: c.list_paginated(
                    namespace=target.namespace, pagination_token=cursor, limit=limit, timeout=5
                ),
            )
        )
        return dict(
            ids=[item["id"] for item in result.get("vectors", [])],
            next=(result.get("pagination") or {}).get("next"),
        )

    def delete(self, target, ids, owner):
        info = self.valid(target.index)
        self.authorization.check("delete", target, ids, info)
        found = self.fetch(target, ids)
        if any(record["metadata"].get("owner_job") != owner for record in found):
            raise VectorError("foreign_id_not_deleted", 409)
        self.data_call(
            target.index, lambda c: c.delete(ids=ids, namespace=target.namespace, timeout=5)
        )
