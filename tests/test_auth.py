"""Tests for authentication endpoints: register, login, me."""


class TestRegister:
    def test_register_success(self, client):
        response = client.post("/api/v1/auth/register", json={
            "email": "new@example.com",
            "username": "newuser",
            "password": "securepass123",
        })
        assert response.status_code == 201
        data = response.json()
        assert data["email"] == "new@example.com"
        assert data["username"] == "newuser"
        assert "password" not in data
        assert "hashed_password" not in data

    def test_register_duplicate_email(self, client, test_user):
        response = client.post("/api/v1/auth/register", json={
            "email": "test@example.com",  # Already exists
            "username": "different",
            "password": "securepass123",
        })
        assert response.status_code == 409

    def test_register_duplicate_username(self, client, test_user):
        response = client.post("/api/v1/auth/register", json={
            "email": "different@example.com",
            "username": "testuser",  # Already exists
            "password": "securepass123",
        })
        assert response.status_code == 409

    def test_register_short_password(self, client):
        response = client.post("/api/v1/auth/register", json={
            "email": "new@example.com",
            "username": "newuser",
            "password": "short",
        })
        assert response.status_code == 422  # Validation error

    def test_register_invalid_email(self, client):
        response = client.post("/api/v1/auth/register", json={
            "email": "not-an-email",
            "username": "newuser",
            "password": "securepass123",
        })
        assert response.status_code == 422


class TestLogin:
    def test_login_success(self, client, test_user):
        response = client.post("/api/v1/auth/login", json={
            "email": "test@example.com",
            "password": "password123",
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self, client, test_user):
        response = client.post("/api/v1/auth/login", json={
            "email": "test@example.com",
            "password": "wrongpassword",
        })
        assert response.status_code == 401

    def test_login_nonexistent_user(self, client):
        response = client.post("/api/v1/auth/login", json={
            "email": "nobody@example.com",
            "password": "password123",
        })
        assert response.status_code == 401


class TestMe:
    def test_get_me_authenticated(self, client, auth_headers):
        response = client.get("/api/v1/auth/me", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "test@example.com"
        assert data["username"] == "testuser"

    def test_get_me_no_token(self, client):
        response = client.get("/api/v1/auth/me")
        assert response.status_code == 403

    def test_get_me_invalid_token(self, client):
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer invalid-token"},
        )
        assert response.status_code == 401
