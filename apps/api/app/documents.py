"""Local document storage, extraction, and canonical source provenance."""

import io
import json
import re
import sqlite3
import unicodedata
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

from pypdf import PdfReader, apply_configuration

MAX_BYTES = 10 * 1024 * 1024
MAX_PAGES = 200
MAX_TEXT = 500_000
NORMALIZATION = "NFC + CRLF/CR to LF; no trim/collapse; pages joined with two LF"


class DocumentError(Exception):
    def __init__(self, message: str, status: int = 422):
        self.message, self.status = message, status


def normalize(text: str) -> str:
    return unicodedata.normalize("NFC", text.replace("\r\n", "\n").replace("\r", "\n"))


def safe_name(filename: str) -> str:
    name = filename.replace("\\", "/").split("/")[-1]
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip(" .")[:120]
    if not name:
        raise DocumentError("Choose a named PDF or UTF-8 TXT file.")
    if re.fullmatch(r"CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]", name.split(".")[0].upper()):
        name = "_" + name
    return name


@apply_configuration(
    maximum_declared_stream_length=8 * 1024 * 1024,
    array_based_stream_maximum_output_length=8 * 1024 * 1024,
    zlib_maximum_output_length=8 * 1024 * 1024,
    lzw_maximum_output_length=8 * 1024 * 1024,
    stream_decoding_work_maximum_length=32 * 1024 * 1024,
)
def extract(data: bytes, filename: str, mime: str) -> tuple[str, list[dict], list[str]]:
    extension = Path(filename).suffix.lower()
    allowed = {
        ".pdf": {"application/pdf", "application/octet-stream"},
        ".txt": {"text/plain", "application/octet-stream"},
    }
    if extension not in allowed or mime not in allowed[extension]:
        raise DocumentError("Upload a PDF or UTF-8 TXT file with a matching content type.", 415)
    warnings = []
    if not data:
        raise DocumentError("The selected file is empty.")
    if extension == ".txt":
        if data.lstrip().startswith(b"%PDF-"):
            raise DocumentError("PDF content cannot be uploaded as TXT.", 415)
        try:
            texts = [data.decode("utf-8-sig")]
        except UnicodeDecodeError as error:
            raise DocumentError("TXT must be UTF-8 (UTF-8 BOM is supported).") from error
        if any(unicodedata.category(char) == "Cc" and char not in "\n\r\t" for char in texts[0]):
            raise DocumentError("Binary/control data is not a plain-text document.", 415)
        if not texts[0].strip():
            raise DocumentError("The TXT file contains no readable text.")
    else:
        if not data.startswith(b"%PDF-") or b"%%EOF" not in data[-4096:]:
            raise DocumentError("Malformed PDF signature or missing PDF end marker.")
        try:
            reader = PdfReader(io.BytesIO(data), strict=True)
            if reader.is_encrypted:
                raise DocumentError("Encrypted PDFs are not supported. Export an unencrypted copy.")
            if not 0 < len(reader.pages) <= MAX_PAGES:
                raise DocumentError(f"PDF must contain 1–{MAX_PAGES} pages.")
            texts = []
            total = 0
            for page in reader.pages:
                content = page.get_contents()
                if content and len(content.get_data()) > 8 * 1024 * 1024:
                    raise DocumentError("PDF page content exceeds the 8 MiB extraction limit.")
                text = page.extract_text() or ""
                total += len(text)
                if total > MAX_TEXT:
                    raise DocumentError(f"Extracted text exceeds {MAX_TEXT:,} characters.")
                texts.append(text)
        except DocumentError:
            raise
        except Exception as error:
            raise DocumentError(
                "Unable to read this PDF. Export a valid text-layer PDF."
            ) from error
    if sum(map(len, texts)) > MAX_TEXT:
        raise DocumentError(f"Text exceeds {MAX_TEXT:,} characters.")
    pages, cursor = [], 0
    for number, raw in enumerate(texts, 1):
        text = normalize(raw)
        pages.append(
            {
                "page_number": number,
                "extracted_text": raw,
                "text": text,
                "start_offset": cursor,
                "end_offset": cursor + len(text),
                "character_count": len(text),
                "status": "text" if text.strip() else "empty",
            }
        )
        cursor += len(text) + 2
    if any(page["status"] == "empty" for page in pages):
        warnings.append("Some pages have no selectable text. OCR NOT AVAILABLE.")
    if not any(page["text"].strip() for page in pages):
        warnings.append("No text layer detected (scan/image-only or blank PDF). OCR NOT AVAILABLE.")
    return extension[1:], pages, warnings


def now() -> str:
    return datetime.now(UTC).isoformat()


class Store:
    def __init__(self, root: Path):
        self.root = root.resolve()

    @contextmanager
    def db(self):
        self.root.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.root / "documents.sqlite3", timeout=15)
        try:
            db.row_factory = sqlite3.Row
            db.execute("PRAGMA foreign_keys=ON")
            schema = db.execute("PRAGMA user_version").fetchone()[0]
            if schema not in (0, 1, 2):
                raise DocumentError(
                    "Unsupported database schema. Preserve data and upgrade the app.", 503
                )
            if schema == 0:
                db.executescript("""
              CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, size INTEGER NOT NULL,
                created_at TEXT NOT NULL, status TEXT NOT NULL, warnings TEXT NOT NULL,
                canonical_text TEXT NOT NULL, confirmed_id TEXT
              );
              CREATE TABLE IF NOT EXISTS pages (
                document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
                page_number INTEGER, data TEXT NOT NULL, PRIMARY KEY(document_id,page_number)
              );
              CREATE TABLE IF NOT EXISTS versions (
                id TEXT PRIMARY KEY, document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
                version INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('draft','confirmed')),
                created_at TEXT NOT NULL, config TEXT NOT NULL,
                UNIQUE(document_id,version)
              );
              CREATE TABLE IF NOT EXISTS chunks (
                id TEXT PRIMARY KEY, version_id TEXT REFERENCES versions(id) ON DELETE CASCADE,
                ordinal INTEGER NOT NULL, data TEXT NOT NULL, UNIQUE(version_id,ordinal)
              );
              PRAGMA user_version=1;
            """)
            if schema < 2:
                db.executescript("""
                  BEGIN IMMEDIATE;
                  CREATE TABLE IF NOT EXISTS embeddings (
                    id TEXT PRIMARY KEY,
                    chunk_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
                    model_signature TEXT NOT NULL,
                    data TEXT NOT NULL,
                    UNIQUE(chunk_id, model_signature)
                  );
                  PRAGMA user_version=2;
                  COMMIT;
                """)
            with db:
                yield db
        finally:
            db.close()

    def get(self, document_id: str) -> dict:
        with self.db() as db:
            row = db.execute("SELECT * FROM documents WHERE id=?", (document_id,)).fetchone()
            if row is None:
                raise DocumentError("Document not found.", 404)
            doc = dict(row)
            doc["warnings"] = json.loads(doc["warnings"])
            doc["pages"] = [
                json.loads(row[0])
                for row in db.execute(
                    "SELECT data FROM pages WHERE document_id=? ORDER BY page_number",
                    (document_id,),
                )
            ]
            doc["page_count"] = len(doc["pages"])
            doc["normalization"] = NORMALIZATION
            doc["versions"] = [
                {**dict(row), "config": json.loads(row["config"])}
                for row in db.execute(
                    "SELECT * FROM versions WHERE document_id=? ORDER BY version DESC",
                    (document_id,),
                )
            ]
            return doc

    def list(self) -> list[dict]:
        with self.db() as db:
            ids = [
                row[0] for row in db.execute("SELECT id FROM documents ORDER BY created_at DESC")
            ]
        return [
            {
                key: value
                for key, value in self.get(identifier).items()
                if key not in {"canonical_text", "pages", "versions"}
            }
            for identifier in ids
        ]

    def upload(self, data: bytes, name: str, mime: str) -> dict:
        name = safe_name(name)
        kind, pages, warnings = extract(data, name, mime)
        identifier = str(uuid4())
        canonical = "\n\n".join(page["text"] for page in pages)
        status = "extracted" if canonical.strip() else "needs_ocr"
        self.root.mkdir(parents=True, exist_ok=True)
        target = self.root / f"{identifier}.{kind}"
        try:
            target.write_bytes(data)
            with self.db() as db:
                db.execute(
                    "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,NULL)",
                    (
                        identifier,
                        name,
                        kind,
                        len(data),
                        now(),
                        status,
                        json.dumps(warnings),
                        canonical,
                    ),
                )
                db.executemany(
                    "INSERT INTO pages VALUES(?,?,?)",
                    [
                        (identifier, p["page_number"], json.dumps(p, ensure_ascii=False))
                        for p in pages
                    ],
                )
        except Exception:
            target.unlink(missing_ok=True)
            raise
        return self.get(identifier)

    def delete(self, identifier: str):
        doc = self.get(identifier)
        # Stored path is reconstructed only from validated UUID + server-selected kind.
        target = self.root / f"{UUID(identifier)}.{doc['kind']}"
        if target.parent.resolve() != self.root:
            raise DocumentError("Invalid storage path.")
        with self.db() as db:
            db.execute("DELETE FROM documents WHERE id=?", (identifier,))
            target.unlink(missing_ok=True)

    def version(self, identifier: str, version_id: str) -> dict:
        with self.db() as db:
            row = db.execute(
                "SELECT * FROM versions WHERE id=? AND document_id=?", (version_id, identifier)
            ).fetchone()
            if row is None:
                raise DocumentError("Chunk version not found for this document.", 404)
            return {
                **dict(row),
                "config": json.loads(row["config"]),
                "chunks": [
                    json.loads(chunk[0])
                    for chunk in db.execute(
                        "SELECT data FROM chunks WHERE version_id=? ORDER BY ordinal", (version_id,)
                    )
                ],
            }

    def save_preview(self, identifier: str, config: dict, make_chunks) -> dict:
        doc = self.get(identifier)
        with self.db() as db:
            # Serialize version allocation even when previews arrive concurrently.
            db.execute("BEGIN IMMEDIATE")
            version = db.execute(
                "SELECT COALESCE(MAX(version),0)+1 FROM versions WHERE document_id=?", (identifier,)
            ).fetchone()[0]
            version_id = str(uuid4())
            chunks = make_chunks(doc, version, version_id)
            db.execute(
                "INSERT INTO versions VALUES(?,?,?,'draft',?,?)",
                (version_id, identifier, version, now(), json.dumps(config)),
            )
            db.executemany(
                "INSERT INTO chunks VALUES(?,?,?,?)",
                [
                    (c["chunk_id"], version_id, c["index"], json.dumps(c, ensure_ascii=False))
                    for c in chunks
                ],
            )
        return self.version(identifier, version_id)

    def confirm(self, identifier: str, version_id: str) -> dict:
        version = self.version(identifier, version_id)
        if not version["chunks"]:
            raise DocumentError("Cannot confirm an empty chunk set.")
        with self.db() as db:
            db.execute("UPDATE versions SET state='confirmed' WHERE id=?", (version_id,))
            db.execute("UPDATE documents SET confirmed_id=? WHERE id=?", (version_id, identifier))
        return self.version(identifier, version_id)
