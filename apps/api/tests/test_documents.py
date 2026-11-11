import io
import json
import sqlite3
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from conftest import make_pdf
from fastapi.testclient import TestClient
from PIL import Image
from pypdf import PdfReader, PdfWriter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from app.chunking import chunk_document
from app.documents import DocumentError, Store, normalize
from app.main import create_app
from testsupport.fixture_server import fixture_engine


def upload(
    client, data=b"Source text.\n\nAnother paragraph.", name="source.txt", mime="text/plain"
):
    return client.post("/api/documents", files={"file": (name, data, mime)})


def test_upload_extract_txt_bom_unicode_and_safe_path(client, tmp_path):
    text = "Cơ sở dữ liệu\r\n\r\n" + unicodedata.normalize("NFD", "Tiếng Việt") + "\rCuối."
    response = upload(client, b"\xef\xbb\xbf" + text.encode(), "../../CON.txt")
    assert response.status_code == 201
    doc = response.json()
    assert doc["name"] == "_CON.txt"
    assert doc["page_count"] == 1
    assert doc["pages"][0]["page_number"] == 1
    assert doc["pages"][0]["extracted_text"] == text
    assert doc["canonical_text"] == "Cơ sở dữ liệu\n\nTiếng Việt\nCuối."
    assert (tmp_path / f"{doc['id']}.txt").is_file()
    assert all(child.name.upper() != "CON.TXT" for child in tmp_path.parent.iterdir())
    escaped = upload(client, b"test", "../../outside.txt").json()
    assert escaped["name"] == "outside.txt"
    assert not (tmp_path.parent / "outside.txt").exists()
    assert len(client.get("/api/documents").json()["documents"]) == 2


@pytest.mark.parametrize(
    "texts", [["Cơ sở dữ liệu tiếng Việt."], ["Trang một. Dữ liệu.", "", "Trang ba. Tìm kiếm."]]
)
def test_pdf_pages_and_unicode(client, texts):
    response = upload(client, make_pdf(texts), "source.pdf", "application/pdf")
    assert response.status_code == 201
    doc = response.json()
    assert doc["page_count"] == len(texts)
    for number, text in enumerate(texts, 1):
        page = doc["pages"][number - 1]
        assert page["page_number"] == number
        assert text in page["text"]
        assert doc["canonical_text"][page["start_offset"] : page["end_offset"]] == page["text"]
    if "" in texts:
        assert "OCR NOT AVAILABLE" in " ".join(doc["warnings"])


def test_no_text_pdf_does_not_invent_ocr(client):
    doc = upload(client, make_pdf([""]), "scan.pdf", "application/pdf").json()
    assert doc["status"] == "needs_ocr"
    assert doc["pages"][0]["text"] == ""
    assert "OCR NOT AVAILABLE" in " ".join(doc["warnings"])
    response = client.post(f"/api/documents/{doc['id']}/preview", json={"size": 300, "overlap": 50})
    assert response.status_code == 422


def test_image_only_pdf_is_preserved_without_invented_text(client):
    stream = io.BytesIO()
    pdf = canvas.Canvas(stream)
    pdf.drawImage(ImageReader(Image.new("RGB", (100, 100), "navy")), 10, 10, 100, 100)
    pdf.showPage()
    pdf.save()
    response = upload(client, stream.getvalue(), "image-only.pdf", "application/pdf")
    assert response.status_code == 201
    assert response.json()["status"] == "needs_ocr"
    assert response.json()["canonical_text"] == ""
    assert "scan/image-only or blank PDF" in " ".join(response.json()["warnings"])


def test_extraction_resource_limits_leave_no_uploaded_files(client, tmp_path):
    assert upload(client, b"a" * 500_001).status_code == 422
    assert (
        upload(client, make_pdf([""] * 201), "too-many.pdf", "application/pdf").status_code == 422
    )
    assert not list(tmp_path.glob("*.txt"))
    assert not list(tmp_path.glob("*.pdf"))


def test_encrypted_and_corrupt_pdf_rejected_without_files(client, tmp_path):
    writer = PdfWriter(clone_from=PdfReader(io.BytesIO(make_pdf(["secret"]))))
    writer.encrypt("password")
    stream = io.BytesIO()
    writer.write(stream)
    for data in [stream.getvalue(), b"%PDF-1.7\ngarbage\n%%EOF", b"not PDF"]:
        assert upload(client, data, "bad.pdf", "application/pdf").status_code == 422
    assert not list(tmp_path.glob("*.pdf"))


@pytest.mark.parametrize(
    "data,name,mime,status",
    [
        (b"", "empty.txt", "text/plain", 422),
        (b"  \n", "blank.txt", "text/plain", 422),
        (b"\xff\xff", "encoding.txt", "text/plain", 422),
        (b"binary\x00", "binary.txt", "text/plain", 415),
        (b"hello", "script.exe", "text/plain", 415),
        (b"hello", "source.txt", "application/pdf", 415),
        (b"%PDF-1.7", "spoof.txt", "text/plain", 415),
    ],
)
def test_input_rejections(client, data, name, mime, status):
    assert upload(client, data, name, mime).status_code == status


def test_upload_size_cap_before_parser_and_inside_stream(tmp_path):
    with TestClient(create_app(tmp_path, fixture_engine, max_bytes=100)) as client:
        assert upload(client, b"a" * 101).status_code == 413
        assert upload(client, b"a" * 70000).status_code == 413
        assert not list(tmp_path.glob("*.txt"))


def test_confirm_versions_isolation_jsonl_and_delete_confirmation(client, tmp_path):
    doc = upload(client, ("Tiếng Việt.\n\n" * 60).encode()).json()
    route = f"/api/documents/{doc['id']}"
    draft = client.post(route + "/preview", json={"size": 100, "overlap": 20}).json()
    version_path = route + f"/versions/{draft['id']}"
    assert client.get(version_path + "/export").status_code == 409
    confirmed = client.post(version_path + "/confirm").json()
    assert confirmed["state"] == "confirmed"
    second = client.post(route + "/preview", json={"size": 150, "overlap": 0}).json()
    assert second["version"] == draft["version"] + 1
    assert client.get(route).json()["confirmed_id"] == draft["id"]
    assert client.get(version_path).json()["chunks"] == draft["chunks"]
    exported = client.get(version_path + "/export")
    assert exported.status_code == 200
    assert [json.loads(line) for line in exported.content.decode().splitlines()] == draft["chunks"]
    assert len({c["chunk_id"] for c in draft["chunks"]}) == len(draft["chunks"])
    other = upload(client, b"other doc").json()
    assert client.get(f"/api/documents/{other['id']}/versions/{draft['id']}").status_code == 404
    assert Store(tmp_path).get(doc["id"])["confirmed_id"] == draft["id"]
    assert client.delete(route).status_code == 409
    assert client.delete(route + "?confirm=true").status_code == 204
    assert client.get(route).status_code == 404
    assert not (tmp_path / f"{doc['id']}.txt").exists()
    assert client.get(f"/api/documents/{other['id']}").status_code == 200


def test_missing_tokenizer_has_actionable_error(tmp_path):
    from app.tokenization import load_tokenizer

    with TestClient(
        create_app(tmp_path, lambda: load_tokenizer(str(tmp_path / "no-assets")))
    ) as client:
        doc = upload(client).json()
        assert client.get("/api/tokenizer").json()["available"] is False
        response = client.post(
            f"/api/documents/{doc['id']}/preview", json={"size": 300, "overlap": 50}
        )
        assert response.status_code == 503
        assert "--accept-download" in response.json()["detail"]


@pytest.mark.parametrize(
    "config",
    [
        {"size": 0, "overlap": 0},
        {"size": 10, "overlap": 10},
        {"size": 300, "overlap": -1},
        {"size": 512, "overlap": 50},
        {"size": "300", "overlap": 50},
    ],
)
def test_invalid_config(client, config):
    doc = upload(client).json()
    assert client.post(f"/api/documents/{doc['id']}/preview", json=config).status_code == 422


def test_canonical_normalization_is_explicit_and_minimal():
    assert normalize("  A\r\n\rB\t ") == "  A\n\nB\t "


def test_unknown_and_invalid_ids(client):
    assert client.get(f"/api/documents/{uuid4()}").status_code == 404
    assert client.get("/api/documents/not-a-uuid").status_code == 422


def test_concurrent_drafts_have_unique_versions_and_survive_store_restart(tmp_path):
    store = Store(tmp_path)
    doc = store.upload(b"Synthetic concurrent source. " * 20, "fixture.txt", "text/plain")

    def generate(_):
        return store.save_preview(
            doc["id"],
            {"size": 100, "overlap": 20},
            lambda source, version, identifier: chunk_document(
                source, 100, 20, fixture_engine(), version, identifier
            ),
        )

    with ThreadPoolExecutor(max_workers=3) as workers:
        drafts = list(workers.map(generate, range(3)))
    assert sorted(d["version"] for d in drafts) == [1, 2, 3]
    assert len({d["id"] for d in drafts}) == 3
    restarted = Store(tmp_path)
    assert restarted.get(doc["id"])["confirmed_id"] is None
    assert len(restarted.get(doc["id"])["versions"]) == 3
    for draft in drafts:
        assert restarted.version(doc["id"], draft["id"])["chunks"] == draft["chunks"]


def test_newer_database_schema_is_rejected_without_overwriting(tmp_path):
    path = tmp_path / "documents.sqlite3"
    with sqlite3.connect(path) as db:
        db.execute("PRAGMA user_version=999")
        db.execute("CREATE TABLE future_data (value TEXT)")
        db.execute("INSERT INTO future_data VALUES ('preserve')")
    with pytest.raises(DocumentError, match="Unsupported database schema"):
        Store(tmp_path).list()
    with sqlite3.connect(path) as db:
        assert db.execute("PRAGMA user_version").fetchone()[0] == 999
        assert db.execute("SELECT value FROM future_data").fetchone()[0] == "preserve"
