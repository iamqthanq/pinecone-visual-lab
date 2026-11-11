import io
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from app.main import create_app
from testsupport.fixture_server import fixture_engine


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path, fixture_engine)) as client:
        yield client


def make_pdf(pages: list[str]) -> bytes:
    stream = io.BytesIO()
    font_path = Path(os.getenv("WINDIR", "C:/Windows")) / "Fonts/arial.ttf"
    pdfmetrics.registerFont(TTFont("Fixture", str(font_path)))
    writer = canvas.Canvas(stream, pagesize=(595, 842))
    for text in pages:
        writer.setFont("Fixture", 12)
        cursor = writer.beginText(45, 790)
        for line in text.splitlines():
            cursor.textLine(line)
        writer.drawText(cursor)
        writer.showPage()
    writer.save()
    return stream.getvalue()
