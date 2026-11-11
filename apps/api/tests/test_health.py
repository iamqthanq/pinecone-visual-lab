from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_reports_real_process_and_explicit_capabilities():
    before = datetime.now(UTC)
    response = client.get("/api/health")
    after = datetime.now(UTC)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "pinecone-visual-lab-api"
    assert data["phase"] == "D01"
    assert data["pinecone"] == "not_configured"
    assert data["embedding"] == "not_loaded"
    assert before <= datetime.fromisoformat(data["timestamp"]) <= after
    assert "api_key" not in data


def test_allowed_browser_origin_and_rejected_external_origin():
    response = client.get("/api/health", headers={"Origin": "http://127.0.0.1:5173"})
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
    response = client.options("/api/health", headers={
        "Origin": "https://untrusted.example", "Access-Control-Request-Method": "GET",
    })
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_future_lab_endpoints_are_not_implemented():
    assert client.post("/api/upload").status_code == 404
    assert client.post("/api/search").status_code == 404
