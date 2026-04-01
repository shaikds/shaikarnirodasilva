"""Tests for editable documents and phase navigation."""
from __future__ import annotations

from typing import Dict, List


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


def _complete_phase(client, project_data: Dict, phase_number: int) -> Dict:
    """Helper to start a phase, toggle all manual actions, and complete it."""
    phase = _get_phase_and_actions(project_data, phase_number)
    pid = project_data["id"]
    # Start the phase
    client.post(f"/api/projects/{pid}/phases/{phase['id']}/start")
    # Toggle all manual actions to done
    for action in phase["actions"]:
        if action["action_type"] == "manual":
            client.put(f"/api/actions/{action['id']}/toggle")
    # Complete the phase
    res = client.post(f"/api/projects/{pid}/phases/{phase['id']}/complete")
    assert res.status_code == 200, f"Failed to complete phase {phase_number}: {res.text}"
    return res.json()


# --- Editable Documents Tests ---


def test_update_document_content(client, sample_project):
    """PUT /api/actions/{id}/document saves edited content and returns it."""
    phase_data = _start_phase(client, sample_project, 1)
    auto_actions = [a for a in phase_data["actions"] if a["action_type"] == "auto"]
    assert len(auto_actions) > 0
    action_id = auto_actions[0]["id"]

    res = client.put(
        f"/api/actions/{action_id}/document",
        json={"content": "EDITED: My custom content"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["content"] == "EDITED: My custom content"
    assert data["action_id"] == action_id


def test_update_document_persists(client, sample_project):
    """Updated document content should persist across GET requests."""
    phase_data = _start_phase(client, sample_project, 1)
    auto_actions = [a for a in phase_data["actions"] if a["action_type"] == "auto"]
    assert len(auto_actions) > 0
    action_id = auto_actions[0]["id"]

    # Update document
    client.put(
        f"/api/actions/{action_id}/document",
        json={"content": "EDITED: Persistent content check"},
    )

    # Read it back
    res = client.get(f"/api/actions/{action_id}/document")
    assert res.status_code == 200
    data = res.json()
    assert data["content"] == "EDITED: Persistent content check"


def test_update_nonexistent_document(client):
    """PUT /api/actions/99999/document should return 404."""
    res = client.put(
        "/api/actions/99999/document",
        json={"content": "test"},
    )
    assert res.status_code == 404


# --- Phase Navigation Tests ---


def test_reopen_completed_phase(client, sample_project):
    """POST /api/projects/{id}/phases/{phase_id}/reopen reopens a completed phase."""
    pid = sample_project["id"]
    phase = _get_phase_and_actions(sample_project, 1)

    # Complete phase 1
    _complete_phase(client, sample_project, 1)

    # Reopen it
    res = client.post(f"/api/projects/{pid}/phases/{phase['id']}/reopen")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "in_progress"


def test_reopen_non_completed_fails(client, sample_project):
    """Reopening a phase that is not completed should return 400."""
    pid = sample_project["id"]
    phase = _get_phase_and_actions(sample_project, 1)

    # Phase 1 is "pending" by default - should fail
    res = client.post(f"/api/projects/{pid}/phases/{phase['id']}/reopen")
    assert res.status_code == 400


def test_reopen_preserves_current_phase(client, sample_project):
    """Reopening phase 1 should NOT change project.current_phase (stays at 2)."""
    pid = sample_project["id"]
    phase1 = _get_phase_and_actions(sample_project, 1)

    # Complete phase 1
    _complete_phase(client, sample_project, 1)

    # Advance to phase 2
    res = client.post(f"/api/projects/{pid}/advance")
    assert res.status_code == 200
    assert res.json()["current_phase"] == 2

    # Reopen phase 1
    res = client.post(f"/api/projects/{pid}/phases/{phase1['id']}/reopen")
    assert res.status_code == 200

    # Verify current_phase is still 2
    res = client.get(f"/api/projects/{pid}")
    assert res.status_code == 200
    assert res.json()["current_phase"] == 2
