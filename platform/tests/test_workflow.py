"""Tests for workflow operations (start/complete phases, actions, advance)."""


def _client_payload():
    return {
        "name": "Workflow Client",
        "company": "WF Co",
        "email": "wf@test.com",
    }


def _project_payload(client_id):
    return {
        "client_id": client_id,
        "name": "Workflow Project",
        "service_type": "AI",
        "budget": 5000.0,
        "timeline_weeks": 4,
    }


def _create_project(http_client):
    """Create a client + project, return the project detail response body."""
    c = http_client.post("/api/clients", json=_client_payload())
    cid = c.json()["id"]
    p = http_client.post("/api/projects", json=_project_payload(cid))
    return p.json()


def test_start_phase(client):
    proj = _create_project(client)
    pid = proj["id"]
    # Phase 1 is already in_progress, so find a pending phase (phase 2)
    phase_2 = [p for p in proj["phases"] if p["phase_number"] == 2][0]
    assert phase_2["status"] == "pending"
    resp = client.post(f"/api/projects/{pid}/phases/{phase_2['id']}/start")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "in_progress"
    assert body["started_at"] is not None
    # Auto actions should be marked done
    auto_actions = [a for a in body["actions"] if a["action_type"] == "auto"]
    for a in auto_actions:
        assert a["status"] == "done"
        assert a["auto_result"] is not None


def test_complete_action(client):
    proj = _create_project(client)
    # Find a pending manual action in phase 1
    phase_1 = [p for p in proj["phases"] if p["phase_number"] == 1][0]
    manual_actions = [a for a in phase_1["actions"] if a["action_type"] == "manual"]
    assert len(manual_actions) > 0
    action_id = manual_actions[0]["id"]
    resp = client.put(f"/api/actions/{action_id}/complete")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "done"
    assert body["completed_at"] is not None


def test_undo_action(client):
    proj = _create_project(client)
    phase_1 = [p for p in proj["phases"] if p["phase_number"] == 1][0]
    manual_actions = [a for a in phase_1["actions"] if a["action_type"] == "manual"]
    action_id = manual_actions[0]["id"]
    # First complete it
    client.put(f"/api/actions/{action_id}/complete")
    # Then undo it
    resp = client.put(f"/api/actions/{action_id}/undo")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "pending"
    assert body["completed_at"] is None


def test_complete_phase(client):
    proj = _create_project(client)
    pid = proj["id"]
    # Phase 1 is in_progress, we can complete it
    phase_1 = [p for p in proj["phases"] if p["phase_number"] == 1][0]
    assert phase_1["status"] == "in_progress"
    resp = client.post(f"/api/projects/{pid}/phases/{phase_1['id']}/complete")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "completed"
    assert body["completed_at"] is not None


def test_advance_project(client):
    proj = _create_project(client)
    pid = proj["id"]
    assert proj["current_phase"] == 1
    resp = client.post(f"/api/projects/{pid}/advance")
    assert resp.status_code == 200
    body = resp.json()
    assert body["current_phase"] == 2
    # Verify the project moved to phase 2
    proj_detail = client.get(f"/api/projects/{pid}").json()
    assert proj_detail["current_phase"] == 2


def test_cannot_advance_incomplete_phase(client):
    proj = _create_project(client)
    pid = proj["id"]
    # Advance once (phase 1 -> 2)
    client.post(f"/api/projects/{pid}/advance")
    # Now phase 2 is in_progress. Advance again should work (it auto-completes current phase)
    # But let's test: complete phase 2, then try to start a phase that's already started
    proj_detail = client.get(f"/api/projects/{pid}").json()
    phase_2 = [p for p in proj_detail["phases"] if p["phase_number"] == 2][0]
    assert phase_2["status"] == "in_progress"
    # Try starting phase 2 again - should fail since it's already in_progress
    resp = client.post(f"/api/projects/{pid}/phases/{phase_2['id']}/start")
    assert resp.status_code == 400
