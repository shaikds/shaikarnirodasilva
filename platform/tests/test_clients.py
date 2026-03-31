"""Tests for the /api/clients endpoints."""


def _client_payload(**overrides):
    data = {
        "name": "John Doe",
        "company": "Acme Corp",
        "email": "john@acme.com",
        "phone": "555-0100",
        "notes": "Test client",
    }
    data.update(overrides)
    return data


def test_create_client(client):
    resp = client.post("/api/clients", json=_client_payload())
    assert resp.status_code == 201
    body = resp.json()
    assert body["id"] is not None
    assert body["name"] == "John Doe"
    assert body["company"] == "Acme Corp"
    assert body["email"] == "john@acme.com"


def test_list_clients(client):
    client.post("/api/clients", json=_client_payload(name="A"))
    client.post("/api/clients", json=_client_payload(name="B"))
    resp = client.get("/api/clients")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_get_client(client):
    create_resp = client.post("/api/clients", json=_client_payload())
    cid = create_resp.json()["id"]
    resp = client.get(f"/api/clients/{cid}")
    assert resp.status_code == 200
    assert resp.json()["id"] == cid


def test_get_client_not_found(client):
    resp = client.get("/api/clients/9999")
    assert resp.status_code == 404


def test_update_client(client):
    create_resp = client.post("/api/clients", json=_client_payload())
    cid = create_resp.json()["id"]
    resp = client.put(f"/api/clients/{cid}", json={"name": "Jane Doe"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Jane Doe"
    # unchanged fields stay the same
    assert resp.json()["company"] == "Acme Corp"


def test_delete_client(client):
    create_resp = client.post("/api/clients", json=_client_payload())
    cid = create_resp.json()["id"]
    resp = client.delete(f"/api/clients/{cid}")
    assert resp.status_code == 204
    # verify gone
    assert client.get(f"/api/clients/{cid}").status_code == 404
