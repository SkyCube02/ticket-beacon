"""
Azure Blob Storage helper.
When AZURE_STORAGE_CONNECTION_STRING is set, files go to blob storage.
When not set (local dev), callers fall back to storing binary in the DB.
"""
import uuid
from .config import settings

_client = None
_container = None


def _get_container():
    global _client, _container
    if _container is not None:
        return _container
    if not settings.AZURE_STORAGE_CONNECTION_STRING:
        return None
    from azure.storage.blob import BlobServiceClient
    _client = BlobServiceClient.from_connection_string(settings.AZURE_STORAGE_CONNECTION_STRING)
    container_client = _client.get_container_client(settings.AZURE_STORAGE_CONTAINER)
    try:
        container_client.create_container()
    except Exception:
        pass  # already exists
    _container = container_client
    return _container


def is_configured() -> bool:
    return bool(settings.AZURE_STORAGE_CONNECTION_STRING)


def upload(data: bytes, filename: str, content_type: str = "application/octet-stream") -> str:
    """Upload bytes to blob, return the blob URL."""
    container = _get_container()
    if container is None:
        raise RuntimeError("Azure Blob Storage is not configured")
    blob_name = f"{uuid.uuid4()}/{filename}"
    blob_client = container.get_blob_client(blob_name)
    blob_client.upload_blob(data, overwrite=True, content_settings=_content_settings(content_type))
    return blob_client.url


def download(blob_url: str) -> bytes:
    """Download bytes from a blob URL."""
    container = _get_container()
    if container is None:
        raise RuntimeError("Azure Blob Storage is not configured")
    # Extract blob name from URL: last two path segments (uuid/filename)
    blob_name = "/".join(blob_url.rstrip("/").split("/")[-2:])
    return container.get_blob_client(blob_name).download_blob().readall()


def delete(blob_url: str) -> None:
    """Delete a blob by URL. Silently ignores missing blobs."""
    container = _get_container()
    if container is None:
        return
    blob_name = "/".join(blob_url.rstrip("/").split("/")[-2:])
    try:
        container.get_blob_client(blob_name).delete_blob()
    except Exception:
        pass


def _content_settings(content_type: str):
    from azure.storage.blob import ContentSettings
    return ContentSettings(content_type=content_type)
