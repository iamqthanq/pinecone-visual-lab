"""Narrow SDK10.3 shim: public index() drops parent RetryConfig.

Index has no retry_config public argument in this pinned release. Fail closed if
the inspected transport changes, rather than silently multiplying D04 retries.
Covered by actual SDK HTTP-transport tests (429/5xx count exactly one request).
"""

from app.vector_contracts import VectorError


def disable_hidden_index_retries(index):
    from pinecone import RetryConfig, __version__
    from pinecone._internal.http_client import _RetryTransport

    try:
        transport = index._http._client._transport
        if __version__ != "10.3.0" or not isinstance(transport, _RetryTransport):
            raise AttributeError("Unsupported pinned transport")
        transport._config = RetryConfig(max_retries=0)
    except AttributeError:
        raise VectorError("sdk_transport_changed_revalidation_required", 503) from None
