"""Persistent SQLite vector adapter. Never imports or calls Pinecone."""

import json

from app.documents import Store
from app.embedding_math import cosine
from app.vector_contracts import Target, VectorError, records_checked


class LocalDemoAdapter:
    mode = "local"

    def __init__(self, store: Store):
        self.store = store

    @staticmethod
    def info(name):
        return dict(
            name=name,
            dimension=384,
            metric="cosine",
            ready=True,
            compatible=True,
            vector_type="dense",
            cloud="local",
            region="this-device",
            project="local",
            mode="local",
            data_origin="SQLite LOCAL DEMO",
        )

    def indexes(self):
        with self.store.db() as db:
            db.execute(
                "INSERT OR IGNORE INTO vector_indexes VALUES(?,?)",
                ("local-e5", json.dumps(self.info("local-e5"))),
            )
            return [
                json.loads(row[0])
                for row in db.execute("SELECT data FROM vector_indexes ORDER BY name")
            ]

    def describe(self, name):
        for item in self.indexes():
            if item["name"] == name:
                return item
        raise VectorError("index_not_found", 404)

    def create(self, name, cloud="local", region="this-device"):
        from sqlite3 import IntegrityError

        Target(index=name)
        self.indexes()
        try:
            with self.store.db() as db:
                db.execute(
                    "INSERT INTO vector_indexes VALUES(?,?)", (name, json.dumps(self.info(name)))
                )
        except IntegrityError as error:
            raise VectorError("duplicate_index", 409) from error
        return self.info(name)

    def namespaces(self, name):
        self.describe(name)
        with self.store.db() as db:
            return [
                dict(namespace=row[0], count=row[1], exists=True)
                for row in db.execute(
                    "SELECT namespace,COUNT(*) FROM local_vectors WHERE index_name=? "
                    "GROUP BY namespace ORDER BY namespace",
                    (name,),
                )
            ]

    def upsert(self, target: Target, records: list[dict]):
        self.describe(target.index)
        records_checked(records)
        with self.store.db() as db:
            for record in records:
                old = db.execute(
                    "SELECT owner_job,data FROM local_vectors WHERE index_name=? "
                    "AND namespace=? AND id=?",
                    (target.index, target.namespace, record["id"]),
                ).fetchone()
                if old and (
                    old[0] != record["metadata"]["owner_job"] or json.loads(old[1]) != record
                ):
                    raise VectorError("id_collision", 409)
                db.execute(
                    "INSERT INTO local_vectors VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING",
                    (
                        target.index,
                        target.namespace,
                        record["id"],
                        record["metadata"]["owner_job"],
                        json.dumps(record, allow_nan=False),
                    ),
                )

    def fetch(self, target: Target, ids: list[str]):
        self.describe(target.index)
        with self.store.db() as db:
            result = []
            for identifier in ids:
                row = db.execute(
                    "SELECT data FROM local_vectors WHERE index_name=? AND namespace=? AND id=?",
                    (target.index, target.namespace, identifier),
                ).fetchone()
                if row:
                    result.append(json.loads(row[0]))
            return result

    def list_ids(self, target: Target, cursor=None, limit=25):
        self.describe(target.index)
        with self.store.db() as db:
            rows = list(
                db.execute(
                    "SELECT id FROM local_vectors WHERE index_name=? AND namespace=? "
                    "AND id>? ORDER BY id LIMIT ?",
                    (target.index, target.namespace, cursor or "", limit + 1),
                )
            )
        return dict(
            ids=[r[0] for r in rows[:limit]], next=rows[limit - 1][0] if len(rows) > limit else None
        )

    def delete(self, target: Target, ids: list[str], owner: str):
        self.describe(target.index)
        with self.store.db() as db:
            for identifier in ids:
                row = db.execute(
                    "SELECT owner_job FROM local_vectors WHERE index_name=? "
                    "AND namespace=? AND id=?",
                    (target.index, target.namespace, identifier),
                ).fetchone()
                if row and row[0] != owner:
                    raise VectorError("foreign_id_not_deleted", 409)
            db.executemany(
                "DELETE FROM local_vectors WHERE index_name=? AND namespace=? "
                "AND id=? AND owner_job=?",
                [(target.index, target.namespace, i, owner) for i in ids],
            )

    cosine = staticmethod(cosine)
