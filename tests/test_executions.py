"""Tests for agent execution endpoints."""

import pytest


@pytest.fixture
def created_agent(client, auth_headers):
    """Create and return an agent for execution tests."""
    response = client.post("/api/v1/agents", json={
        "name": "Test Agent",
        "system_prompt": "You are a test agent.",
        "tools": ["search", "calculate"],
        "max_iterations": 5,
    }, headers=auth_headers)
    return response.json()


class TestExecuteAgent:
    def test_execute_agent_success(self, client, auth_headers, created_agent):
        response = client.post(
            f"/api/v1/agents/{created_agent['id']}/execute",
            json={"input_text": "Analyze this code for bugs"},
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "completed"
        assert data["input_text"] == "Analyze this code for bugs"
        assert data["output_text"] is not None
        assert data["logs"] is not None
        assert data["iterations_used"] > 0

    def test_execute_agent_not_found(self, client, auth_headers):
        response = client.post(
            "/api/v1/agents/999/execute",
            json={"input_text": "test"},
            headers=auth_headers,
        )
        assert response.status_code == 404

    def test_execute_agent_empty_input(self, client, auth_headers, created_agent):
        response = client.post(
            f"/api/v1/agents/{created_agent['id']}/execute",
            json={"input_text": ""},
            headers=auth_headers,
        )
        assert response.status_code == 422

    def test_execute_unauthenticated(self, client, created_agent):
        response = client.post(
            f"/api/v1/agents/{created_agent['id']}/execute",
            json={"input_text": "test"},
        )
        assert response.status_code == 403


class TestListExecutions:
    def test_list_executions_empty(self, client, auth_headers):
        response = client.get("/api/v1/executions", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["executions"] == []
        assert data["total"] == 0

    def test_list_executions_after_run(self, client, auth_headers, created_agent):
        # Execute the agent
        client.post(
            f"/api/v1/agents/{created_agent['id']}/execute",
            json={"input_text": "Task 1"},
            headers=auth_headers,
        )
        client.post(
            f"/api/v1/agents/{created_agent['id']}/execute",
            json={"input_text": "Task 2"},
            headers=auth_headers,
        )

        response = client.get("/api/v1/executions", headers=auth_headers)
        data = response.json()
        assert data["total"] == 2
        assert len(data["executions"]) == 2


class TestGetExecution:
    def test_get_execution_details(self, client, auth_headers, created_agent):
        exec_resp = client.post(
            f"/api/v1/agents/{created_agent['id']}/execute",
            json={"input_text": "Analyze this"},
            headers=auth_headers,
        )
        execution_id = exec_resp.json()["id"]

        response = client.get(f"/api/v1/executions/{execution_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == execution_id
        assert data["status"] == "completed"
        assert data["logs"] is not None

    def test_get_execution_not_found(self, client, auth_headers):
        response = client.get("/api/v1/executions/999", headers=auth_headers)
        assert response.status_code == 404


class TestCancelExecution:
    def test_cancel_completed_execution_fails(self, client, auth_headers, created_agent):
        exec_resp = client.post(
            f"/api/v1/agents/{created_agent['id']}/execute",
            json={"input_text": "Task"},
            headers=auth_headers,
        )
        execution_id = exec_resp.json()["id"]

        # Can't cancel a completed execution
        response = client.post(
            f"/api/v1/executions/{execution_id}/cancel",
            headers=auth_headers,
        )
        assert response.status_code == 400
