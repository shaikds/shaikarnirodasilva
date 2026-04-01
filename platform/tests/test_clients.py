from __future__ import annotations

from typing import Dict


def test_create_client(client):
    res = client.post(
        "/api/clients",
        json={"name": "Alice", "company": "ACME", "email": "alice@acme.com"},
    )
    assert res.status_code == 201
    data = res.json()
    assert "id" in data
    assert data["name"] == "Alice"
    assert data["email"] == "alice@acme.com"


def test_create_client_missing_name(client):
    res = client.post(
        "/api/clients",
        json={"company": "ACME", "email": "alice@acme.com"},
    )
    assert res.status_code == 422


def test_list_clients(client, sample_client):
    res = client.get("/api/clients")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) >= 1


def test_get_client(client, sample_client):
    cid = sample_client["id"]
    res = client.get(f"/api/clients/{cid}")
    assert res.status_code == 200
    assert res.json()["id"] == cid


def test_get_client_not_found(client):
    res = client.get("/api/clients/99999")
    assert res.status_code == 404


def test_update_client(client, sample_client):
    cid = sample_client["id"]
    res = client.put(f"/api/clients/{cid}", json={"name": "Updated Name"})
    assert res.status_code == 200
    assert res.json()["name"] == "Updated Name"


def test_delete_client(client, sample_client):
    cid = sample_client["id"]
    res = client.delete(f"/api/clients/{cid}")
    assert res.status_code == 200
    # Verify it's gone
    res2 = client.get(f"/api/clients/{cid}")
    assert res2.status_code == 404
