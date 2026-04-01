from __future__ import annotations

from typing import Dict, List, Optional


def _get_phase_and_actions(project_data: Dict, phase_number: int) -> Dict:
    """Helper to get a specific phase from project data."""
    for phase in project_data["phases"]:
        if phase["phase_number"] == phase_number:
            return phase
    raise ValueError(f"Phase {phase_number} not found")


def _start_phase(client, project_data: Dict, phase_number: int) -> Dict:
    """Helper to start a specific phase."""
    phase = _get_phase_and_actions(project_data, phase_number)
    pid = project_data["id"]
    res = client.post(f"/api/projects/{pid}/phases/{phase['id']}/start")
    assert res.status_code == 200, f"Failed to start phase {phase_number}: {res.text}"
    return res.json()


def test_start_phase(client, sample_project):
    """Starting a phase should auto-complete auto actions with auto_result content."""
    phase_data = _start_phase(client, sample_project, 1)
    assert phase_data["status"] == "in_progress"
    for action in phase_data["actions"]:
        if action["action_type"] == "auto":
            assert action["status"] == "done"
            assert action["auto_result"] is not None
            assert len(action["auto_result"]) > 0


def test_start_phase_generates_real_document(client, sample_project):
    """Auto result should contain client name from template substitution."""
    phase_data = _start_phase(client, sample_project, 1)
    auto_actions = [a for a in phase_data["actions"] if a["action_type"] == "auto"]
    assert len(auto_actions) > 0
    # "Acme Corp" is the company from sample_client
    assert "Acme Corp" in auto_actions[0]["auto_result"]


def test_get_document(client, sample_project):
    """GET /api/actions/{id}/document returns content with 100+ chars."""
    phase_data = _start_phase(client, sample_project, 1)
    auto_actions = [a for a in phase_data["actions"] if a["action_type"] == "auto"]
    assert len(auto_actions) > 0
    action_id = auto_actions[0]["id"]
    res = client.get(f"/api/actions/{action_id}/document")
    assert res.status_code == 200
    data = res.json()
    assert "content" in data
    assert len(data["content"]) >= 100


def test_get_document_before_start(client, sample_project):
    """GET /api/actions/{id}/document should 404 if phase not started yet."""
    phase = _get_phase_and_actions(sample_project, 1)
    auto_actions = [a for a in phase["actions"] if a["action_type"] == "auto"]
    assert len(auto_actions) > 0
    action_id = auto_actions[0]["id"]
    res = client.get(f"/api/actions/{action_id}/document")
    assert res.status_code == 404


def test_toggle_action(client, sample_project):
    """Toggling a manual action should change its status."""
    phase = _get_phase_and_actions(sample_project, 1)
    manual_actions = [a for a in phase["actions"] if a["action_type"] == "manual"]
    assert len(manual_actions) > 0
    action_id = manual_actions[0]["id"]
    original_status = manual_actions[0]["status"]
    res = client.put(f"/api/actions/{action_id}/toggle")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] != original_status


def test_toggle_action_twice(client, sample_project):
    """Toggling twice should return to original status."""
    phase = _get_phase_and_actions(sample_project, 1)
    manual_actions = [a for a in phase["actions"] if a["action_type"] == "manual"]
    action_id = manual_actions[0]["id"]
    original_status = manual_actions[0]["status"]
    # Toggle once
    client.put(f"/api/actions/{action_id}/toggle")
    # Toggle again
    res = client.put(f"/api/actions/{action_id}/toggle")
    assert res.status_code == 200
    assert res.json()["status"] == original_status


def test_cannot_complete_phase_with_pending_tasks(client, sample_project):
    """Completing a phase with pending manual tasks should return 400."""
    phase = _get_phase_and_actions(sample_project, 1)
    pid = sample_project["id"]
    # Start the phase first
    client.post(f"/api/projects/{pid}/phases/{phase['id']}/start")
    # Try to complete without finishing manual tasks
    res = client.post(f"/api/projects/{pid}/phases/{phase['id']}/complete")
    assert res.status_code == 400


def test_complete_phase_after_all_done(client, sample_project):
    """Completing a phase after all manual tasks are done should return 200."""
    phase = _get_phase_and_actions(sample_project, 1)
    pid = sample_project["id"]
    # Start the phase
    client.post(f"/api/projects/{pid}/phases/{phase['id']}/start")
    # Toggle all manual actions to done
    for action in phase["actions"]:
        if action["action_type"] == "manual":
            client.put(f"/api/actions/{action['id']}/toggle")
    # Complete the phase
    res = client.post(f"/api/projects/{pid}/phases/{phase['id']}/complete")
    assert res.status_code == 200
    assert res.json()["status"] == "completed"


def test_advance_project(client, sample_project):
    """Advancing project should increment current_phase."""
    pid = sample_project["id"]
    phase = _get_phase_and_actions(sample_project, 1)
    # Start phase
    client.post(f"/api/projects/{pid}/phases/{phase['id']}/start")
    # Complete all manual actions
    for action in phase["actions"]:
        if action["action_type"] == "manual":
            client.put(f"/api/actions/{action['id']}/toggle")
    # Complete the phase
    client.post(f"/api/projects/{pid}/phases/{phase['id']}/complete")
    # Advance
    res = client.post(f"/api/projects/{pid}/advance")
    assert res.status_code == 200
    assert res.json()["current_phase"] == 2


def test_advance_blocked_without_completing(client, sample_project):
    """Advancing without completing current phase tasks should return 400."""
    pid = sample_project["id"]
    phase = _get_phase_and_actions(sample_project, 1)
    # Start the phase but don't complete tasks
    client.post(f"/api/projects/{pid}/phases/{phase['id']}/start")
    res = client.post(f"/api/projects/{pid}/advance")
    assert res.status_code == 400
