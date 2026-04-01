"""Tests for Kanban and CRM view API dependencies."""
from __future__ import annotations


def test_dashboard_returns_projects_for_kanban(client, sample_client):
    """Kanban board needs projects with current_phase and current_phase_name."""
    # Create 2 projects - both start at phase 1 (Discovery)
    p1 = client.post("/api/projects", json={
        "client_id": sample_client["id"],
        "name": "Kanban Project A",
        "service_type": "ai_agents",
        "budget": 3000,
    }).json()

    p2 = client.post("/api/projects", json={
        "client_id": sample_client["id"],
        "name": "Kanban Project B",
        "service_type": "web_dev",
        "budget": 4000,
    }).json()

    # Advance project B through phase 1 so it's in a different phase
    # Start phase 1, complete all actions, then advance
    client.post(f"/api/projects/{p2['id']}/phases/1/start")
    phase1 = next(ph for ph in p2["phases"] if ph["phase_number"] == 1)
    for action in phase1["actions"]:
        client.post(f"/api/projects/{p2['id']}/actions/{action['id']}/toggle")
    client.post(f"/api/projects/{p2['id']}/phases/1/complete")
    client.post(f"/api/projects/{p2['id']}/advance")

    # Dashboard should return both projects with phase info
    res = client.get("/api/dashboard")
    assert res.status_code == 200
    data = res.json()
    projects = data["projects"]
    assert len(projects) >= 2

    by_name = {p["name"]: p for p in projects}
    a = by_name["Kanban Project A"]
    b = by_name["Kanban Project B"]

    # Project A still at phase 1
    assert a["current_phase"] == 1
    assert a["current_phase_name"] == "Discovery"

    # Project B advanced to phase 2
    assert b["current_phase"] == 2
    assert b["current_phase_name"] == "Technical Assessment"


def test_dashboard_status_filter_for_kanban(client, sample_client):
    """Kanban filters by status - only active projects should appear."""
    client.post("/api/projects", json={
        "client_id": sample_client["id"],
        "name": "Active Project",
        "service_type": "ai_agents",
        "budget": 2000,
    })

    res = client.get("/api/dashboard?status=active")
    assert res.status_code == 200
    data = res.json()
    assert len(data["projects"]) >= 1
    for p in data["projects"]:
        assert p["status"] == "active"

    # Completed filter should not include our active project
    res2 = client.get("/api/dashboard?status=completed")
    assert res2.status_code == 200
    data2 = res2.json()
    assert all(p["status"] == "completed" for p in data2["projects"])


def test_clients_list_for_crm(client):
    """CRM view needs the full clients list."""
    client.post("/api/clients", json={
        "name": "CRM Client 1",
        "company": "Corp A",
        "email": "crm1@test.com",
    })
    client.post("/api/clients", json={
        "name": "CRM Client 2",
        "company": "Corp B",
        "email": "crm2@test.com",
    })

    res = client.get("/api/clients")
    assert res.status_code == 200
    clients = res.json()
    assert len(clients) >= 2

    names = [c["name"] for c in clients]
    assert "CRM Client 1" in names
    assert "CRM Client 2" in names
    # Each client should have fields the CRM needs
    for c in clients:
        assert "id" in c
        assert "name" in c
        assert "company" in c
        assert "email" in c


def test_crm_data_completeness(client, sample_project):
    """CRM needs client_name and progress_percent from dashboard."""
    res = client.get("/api/dashboard")
    assert res.status_code == 200
    data = res.json()
    assert len(data["projects"]) >= 1

    proj = data["projects"][0]
    # CRM requires these fields
    assert "client_name" in proj
    assert proj["client_name"] != ""
    assert proj["client_name"] != "N/A"
    assert "progress_percent" in proj
    assert isinstance(proj["progress_percent"], (int, float))
    assert 0 <= proj["progress_percent"] <= 100
    # Also needs budget and service_type
    assert "budget" in proj
    assert "service_type" in proj
