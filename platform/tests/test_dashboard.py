"""Tests for the /api/dashboard endpoints."""


def _client_payload():
    return {
        "name": "Dash Client",
        "company": "Dash Co",
        "email": "dash@test.com",
    }


def _project_payload(client_id):
    return {
        "client_id": client_id,
        "name": "Dash Project",
        "service_type": "AI",
    }


def test_dashboard_empty(client):
    resp = client.get("/api/dashboard")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_clients"] == 0
    assert body["total_projects"] == 0
    assert body["active_projects"] == 0
    assert body["completed_projects"] == 0
    assert body["on_hold_projects"] == 0
    assert body["cancelled_projects"] == 0
    assert body["phases_breakdown"] == {}


def test_dashboard_with_data(client):
    # Create a client and a project
    c_resp = client.post("/api/clients", json=_client_payload())
    cid = c_resp.json()["id"]
    client.post("/api/projects", json=_project_payload(cid))

    resp = client.get("/api/dashboard")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_clients"] == 1
    assert body["total_projects"] == 1
    assert body["active_projects"] == 1
    assert body["completed_projects"] == 0
    # Phase 1 is "Discovery", so phases_breakdown should reflect that
    assert body["phases_breakdown"].get("Discovery", 0) == 1
