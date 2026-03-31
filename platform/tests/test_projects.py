"""Tests for the /api/projects endpoints."""


def _client_payload(**overrides):
    data = {
        "name": "Test Client",
        "company": "Test Co",
        "email": "test@test.com",
    }
    data.update(overrides)
    return data


def _project_payload(client_id, **overrides):
    data = {
        "client_id": client_id,
        "name": "Test Project",
        "service_type": "AI",
        "budget": 10000.0,
        "timeline_weeks": 8,
    }
    data.update(overrides)
    return data


def _create_client_and_project(client):
    """Helper: create a client then a project, return (client_resp, project_resp)."""
    c = client.post("/api/clients", json=_client_payload())
    cid = c.json()["id"]
    p = client.post("/api/projects", json=_project_payload(cid))
    return c, p


def test_create_project(client):
    c_resp = client.post("/api/clients", json=_client_payload())
    cid = c_resp.json()["id"]
    resp = client.post("/api/projects", json=_project_payload(cid))
    assert resp.status_code == 201
    body = resp.json()
    assert body["id"] is not None
    assert body["name"] == "Test Project"
    assert body["service_type"] == "AI"
    assert body["client_id"] == cid
    assert body["status"] == "active"
    assert body["current_phase"] == 1


def test_create_project_creates_11_phases(client):
    _, p_resp = _create_client_and_project(client)
    body = p_resp.json()
    assert len(body["phases"]) == 11
    phase_numbers = [p["phase_number"] for p in body["phases"]]
    assert phase_numbers == list(range(1, 12))


def test_create_project_creates_actions(client):
    _, p_resp = _create_client_and_project(client)
    body = p_resp.json()
    for phase in body["phases"]:
        assert len(phase["actions"]) > 0, f"Phase {phase['phase_number']} has no actions"


def test_list_projects(client):
    c_resp = client.post("/api/clients", json=_client_payload())
    cid = c_resp.json()["id"]
    client.post("/api/projects", json=_project_payload(cid, name="P1"))
    client.post("/api/projects", json=_project_payload(cid, name="P2"))
    resp = client.get("/api/projects")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_get_project_detail(client):
    _, p_resp = _create_client_and_project(client)
    pid = p_resp.json()["id"]
    resp = client.get(f"/api/projects/{pid}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == pid
    assert "phases" in body
    assert len(body["phases"]) == 11
    # Each phase should have actions
    for phase in body["phases"]:
        assert "actions" in phase
        assert len(phase["actions"]) > 0


def test_get_project_not_found(client):
    resp = client.get("/api/projects/9999")
    assert resp.status_code == 404
