"""Tests for agent CRUD endpoints."""

import pytest


@pytest.fixture
def sample_agent_data():
    return {
        "name": "Code Reviewer",
        "description": "Reviews code for bugs and best practices",
        "system_prompt": "You are an expert code reviewer. Analyze the given code for bugs, security issues, and best practices.",
        "model": "gpt-4",
        "tools": ["read_file", "search_code"],
        "max_iterations": 5,
    }


class TestCreateAgent:
    def test_create_agent_success(self, client, auth_headers, sample_agent_data):
        response = client.post("/api/v1/agents", json=sample_agent_data, headers=auth_headers)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Code Reviewer"
        assert data["model"] == "gpt-4"
        assert data["max_iterations"] == 5

    def test_create_agent_minimal(self, client, auth_headers):
        response = client.post("/api/v1/agents", json={
            "name": "Simple Agent",
            "system_prompt": "You are a helpful assistant.",
        }, headers=auth_headers)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Simple Agent"
        assert data["model"] == "gpt-4"  # Default
        assert data["max_iterations"] == 10  # Default

    def test_create_agent_unauthenticated(self, client, sample_agent_data):
        response = client.post("/api/v1/agents", json=sample_agent_data)
        assert response.status_code == 403

    def test_create_agent_missing_name(self, client, auth_headers):
        response = client.post("/api/v1/agents", json={
            "system_prompt": "You are a helper.",
        }, headers=auth_headers)
        assert response.status_code == 422


class TestListAgents:
    def test_list_agents_empty(self, client, auth_headers):
        response = client.get("/api/v1/agents", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["agents"] == []
        assert data["total"] == 0

    def test_list_agents_with_data(self, client, auth_headers):
        # Create 2 agents
        for i in range(2):
            client.post("/api/v1/agents", json={
                "name": f"Agent {i}",
                "system_prompt": "Test prompt",
            }, headers=auth_headers)

        response = client.get("/api/v1/agents", headers=auth_headers)
        data = response.json()
        assert data["total"] == 2
        assert len(data["agents"]) == 2

    def test_list_agents_pagination(self, client, auth_headers):
        for i in range(5):
            client.post("/api/v1/agents", json={
                "name": f"Agent {i}",
                "system_prompt": "Test prompt",
            }, headers=auth_headers)

        response = client.get("/api/v1/agents?skip=0&limit=2", headers=auth_headers)
        data = response.json()
        assert data["total"] == 5
        assert len(data["agents"]) == 2


class TestGetAgent:
    def test_get_agent_success(self, client, auth_headers, sample_agent_data):
        create_resp = client.post("/api/v1/agents", json=sample_agent_data, headers=auth_headers)
        agent_id = create_resp.json()["id"]

        response = client.get(f"/api/v1/agents/{agent_id}", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["name"] == "Code Reviewer"

    def test_get_agent_not_found(self, client, auth_headers):
        response = client.get("/api/v1/agents/999", headers=auth_headers)
        assert response.status_code == 404


class TestUpdateAgent:
    def test_update_agent_success(self, client, auth_headers, sample_agent_data):
        create_resp = client.post("/api/v1/agents", json=sample_agent_data, headers=auth_headers)
        agent_id = create_resp.json()["id"]

        response = client.put(f"/api/v1/agents/{agent_id}", json={
            "name": "Updated Name",
            "max_iterations": 20,
        }, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["max_iterations"] == 20
        # Unchanged fields should remain
        assert data["model"] == "gpt-4"

    def test_update_agent_not_found(self, client, auth_headers):
        response = client.put("/api/v1/agents/999", json={"name": "X"}, headers=auth_headers)
        assert response.status_code == 404


class TestDeleteAgent:
    def test_delete_agent_success(self, client, auth_headers, sample_agent_data):
        create_resp = client.post("/api/v1/agents", json=sample_agent_data, headers=auth_headers)
        agent_id = create_resp.json()["id"]

        response = client.delete(f"/api/v1/agents/{agent_id}", headers=auth_headers)
        assert response.status_code == 204

        # Verify it's gone
        get_resp = client.get(f"/api/v1/agents/{agent_id}", headers=auth_headers)
        assert get_resp.status_code == 404

    def test_delete_agent_not_found(self, client, auth_headers):
        response = client.delete("/api/v1/agents/999", headers=auth_headers)
        assert response.status_code == 404
