from rv_contracts import Role
from support import PASSWORD, Account, Api, bearer


def test_signup_creates_org_and_owner(api: Api, owner: Account) -> None:
    me = api.client.get("/api/v1/me", headers=owner.headers).json()
    assert me["user"]["email"] == "owner@a.test"
    assert me["org"]["name"] == "Org A"
    assert me["org"]["plan"] == "pro"
    assert me["memberships"] == [{"role": "owner", "site_id": None}]
    assert me["sites"] == []
    assert owner.tokens["token_type"] == "bearer"
    assert owner.tokens["expires_in"] == 15 * 60


def test_signup_duplicate_email_conflicts(api: Api, owner: Account) -> None:
    r = api.client.post(
        "/api/v1/auth/signup",
        json={"org_name": "X", "name": "Y", "email": "OWNER@a.test", "password": PASSWORD},
    )
    assert r.status_code == 409


def test_validation_errors_do_not_echo_input(api: Api) -> None:
    r = api.client.post(
        "/api/v1/auth/signup",
        json={"org_name": "X", "name": "Y", "email": "x@y.test", "password": "Zq9!x"},
    )
    assert r.status_code == 422
    assert "Zq9!x" not in r.text
    assert r.json()["detail"][0]["loc"] == ["body", "password"]


def test_login_is_case_insensitive_and_rejects_bad_password(api: Api, owner: Account) -> None:
    assert api.login("Owner@A.test").user_id == owner.user_id
    r = api.client.post("/api/v1/auth/login", json={"email": "owner@a.test", "password": "nope"})
    assert r.status_code == 401
    assert r.headers["www-authenticate"] == "Bearer"
    r = api.client.post("/api/v1/auth/login", json={"email": "ghost@a.test", "password": "nope"})
    assert r.status_code == 401


def test_login_rate_limit(api: Api, owner: Account) -> None:
    for _ in range(5):
        r = api.client.post(
            "/api/v1/auth/login", json={"email": "owner@a.test", "password": "wrong-pass"}
        )
        assert r.status_code == 401
    r = api.client.post("/api/v1/auth/login", json={"email": "owner@a.test", "password": PASSWORD})
    assert r.status_code == 429
    assert int(r.headers["retry-after"]) > 0
    api.clock.advance(301)
    assert api.login("owner@a.test").user_id == owner.user_id


def test_refresh_flow_and_expiry(api: Api, owner: Account) -> None:
    api.clock.advance(15 * 60 + 1)
    assert api.client.get("/api/v1/me", headers=owner.headers).status_code == 401
    r = api.client.post(
        "/api/v1/auth/refresh", json={"refresh_token": owner.tokens["refresh_token"]}
    )
    assert r.status_code == 200
    fresh = bearer(r.json()["access_token"])
    assert api.client.get("/api/v1/me", headers=fresh).status_code == 200
    # An access token is not a refresh token, and vice versa.
    r = api.client.post("/api/v1/auth/refresh", json={"refresh_token": r.json()["access_token"]})
    assert r.status_code == 401
    assert (
        api.client.get("/api/v1/me", headers=bearer(owner.tokens["refresh_token"])).status_code
        == 401
    )
    # Refresh tokens expire after 30 days.
    api.clock.advance(31 * 86400)
    r = api.client.post(
        "/api/v1/auth/refresh", json={"refresh_token": owner.tokens["refresh_token"]}
    )
    assert r.status_code == 401


def test_garbage_and_missing_tokens(api: Api) -> None:
    assert api.client.get("/api/v1/me").status_code == 401
    assert api.client.get("/api/v1/me", headers=bearer("not-a-jwt")).status_code == 401


def test_password_change_revokes_tokens(api: Api, owner: Account) -> None:
    site_id = api.create_site(owner)
    manager = api.add_user(owner, "m@a.test", Role.MANAGER, site_id)
    r = api.client.patch(
        f"/api/v1/orgs/{owner.org_id}/users/{manager.user_id}",
        headers=owner.headers,
        json={"password": "new-password-456"},
    )
    assert r.status_code == 200
    assert api.client.get("/api/v1/me", headers=manager.headers).status_code == 401
    r = api.client.post(
        "/api/v1/auth/refresh", json={"refresh_token": manager.tokens["refresh_token"]}
    )
    assert r.status_code == 401
    assert api.login("m@a.test", "new-password-456").user_id == manager.user_id


def test_deleted_user_tokens_stop_working(api: Api, owner: Account) -> None:
    site_id = api.create_site(owner)
    waiter = api.add_user(owner, "w@a.test", Role.WAITER, site_id)
    r = api.client.delete(
        f"/api/v1/orgs/{owner.org_id}/users/{waiter.user_id}", headers=owner.headers
    )
    assert r.status_code == 204
    assert api.client.get("/api/v1/me", headers=waiter.headers).status_code == 401
