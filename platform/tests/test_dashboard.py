from __future__ import annotations

from typing import Dict, List


def test_dashboard_empty(client):
    """Dashboard with no data should return 200 with zeros."""
    res = client.get("/api/dashboard")
    assert res.status_code == 200
    data = res.json()
    assert data["total_clients"] == 0
    assert data["active_projects"] == 0
    assert data["completed_projects"] == 0
    assert data["total_revenue"] == 0


def test_dashboard_with_project(client, sample_project):
    """Dashboard should reflect created project counts."""
    res = client.get("/api/dashboard")
    assert res.status_code == 200
    data = res.json()
    assert data["total_clients"] >= 1
    assert data["active_projects"] >= 1
    assert data["total_revenue"] >= 5000
    assert len(data["projects"]) >= 1


def test_dashboard_has_alerts(client, sample_project):
    """Dashboard should have an alerts list (may be empty for fresh projects)."""
    res = client.get("/api/dashboard")
    assert res.status_code == 200
    data = res.json()
    assert "alerts" in data
    assert isinstance(data["alerts"], list)


def test_dashboard_filters(client, sample_project):
    """Dashboard ?status=active should filter correctly."""
    res = client.get("/api/dashboard?status=active")
    assert res.status_code == 200
    data = res.json()
    for p in data["projects"]:
        assert p["status"] == "active"

    # Filter for completed should return no projects (none completed yet)
    res2 = client.get("/api/dashboard?status=completed")
    assert res2.status_code == 200
    data2 = res2.json()
    assert len(data2["projects"]) == 0
