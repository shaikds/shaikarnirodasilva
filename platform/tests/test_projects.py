from __future__ import annotations

from typing import Dict, List


def test_create_project(client, sample_client):
    res = client.post(
        "/api/projects",
        json={
            "client_id": sample_client["id"],
            "name": "My Project",
            "service_type": "ai_agents",
            "budget": 3000,
            "timeline_weeks": 6,
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert "id" in data
    assert len(data["phases"]) == 11


def test_create_project_invalid_service_type(client, sample_client):
    res = client.post(
        "/api/projects",
        json={
            "client_id": sample_client["id"],
            "name": "Bad Type",
            "service_type": "invalid_type",
        },
    )
    assert res.status_code == 422


def test_create_project_invalid_client(client):
    res = client.post(
        "/api/projects",
        json={
            "client_id": 99999,
            "name": "Orphan Project",
            "service_type": "web_dev",
        },
    )
    assert res.status_code == 400


def test_project_has_actions(client, sample_project):
    phases = sample_project["phases"]
    for phase in phases:
        assert len(phase["actions"]) >= 1, f"Phase {phase['phase_name']} has no actions"


def test_actions_have_hints(client, sample_project):
    """Manual actions should have a hint field."""
    for phase in sample_project["phases"]:
        for action in phase["actions"]:
            if action["action_type"] == "manual":
                assert action["hint"] is not None, (
                    f"Manual action '{action['description']}' missing hint"
                )


def test_list_projects(client, sample_project):
    res = client.get("/api/projects")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) >= 1


def test_get_project(client, sample_project):
    pid = sample_project["id"]
    res = client.get(f"/api/projects/{pid}")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == pid
    assert "phases" in data
    assert len(data["phases"]) == 11
    # Phases should have actions
    for phase in data["phases"]:
        assert "actions" in phase


def test_get_project_not_found(client):
    res = client.get("/api/projects/99999")
    assert res.status_code == 404
