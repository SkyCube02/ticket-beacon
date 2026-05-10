from .conftest import auth


def test_login_success(client, admin_user):
    r = client.post("/api/auth/login", data={"username": "admin@test.com", "password": "AdminPass1!"})
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert data["user"]["role"] == "SYSTEM_ADMIN"


def test_login_wrong_password(client, admin_user):
    r = client.post("/api/auth/login", data={"username": "admin@test.com", "password": "wrong"})
    assert r.status_code == 401


def test_login_unknown_email(client):
    r = client.post("/api/auth/login", data={"username": "nobody@test.com", "password": "x"})
    assert r.status_code == 401


def test_me(client, admin_token):
    r = client.get("/api/auth/me", headers=auth(admin_token))
    assert r.status_code == 200
    assert r.json()["email"] == "admin@test.com"


def test_me_unauthenticated(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_change_password_weak(client, agent_token):
    r = client.post("/api/auth/change-password", json={"current_password": "AgentPass1!", "new_password": "short"}, headers=auth(agent_token))
    assert r.status_code == 422


def test_change_password_wrong_current(client, agent_token):
    r = client.post("/api/auth/change-password", json={"current_password": "wrong", "new_password": "NewSecure@Pass1"}, headers=auth(agent_token))
    assert r.status_code == 400


def test_change_password_success(client, agent_token, agent_user, db):
    r = client.post("/api/auth/change-password", json={"current_password": "AgentPass1!", "new_password": "NewSecure@Pass9"}, headers=auth(agent_token))
    assert r.status_code == 200
    # Reset password for other tests
    from app.auth import hash_password
    db.refresh(agent_user)
    agent_user.password_hash = hash_password("AgentPass1!")
    db.commit()


def test_password_policy_no_uppercase(client, agent_token):
    r = client.post("/api/auth/change-password", json={"current_password": "AgentPass1!", "new_password": "nouppercasepassword1!"}, headers=auth(agent_token))
    assert r.status_code == 422


def test_password_policy_no_number(client, agent_token):
    r = client.post("/api/auth/change-password", json={"current_password": "AgentPass1!", "new_password": "NoNumberHere!abc"}, headers=auth(agent_token))
    assert r.status_code == 422


def test_password_policy_no_special(client, agent_token):
    r = client.post("/api/auth/change-password", json={"current_password": "AgentPass1!", "new_password": "NoSpecialChar12"}, headers=auth(agent_token))
    assert r.status_code == 422


def test_login_remaining_attempts_shown(client, admin_user):
    r = client.post("/api/auth/login", data={"username": "admin@test.com", "password": "wrongpassword"})
    assert r.status_code == 401
    assert "remaining" in r.json()["detail"]


def test_account_lockout_after_max_attempts(client, db):
    from app.auth import hash_password
    from app import models
    lockout_user = models.User(
        email="lockout@test.com",
        full_name="Lockout Test",
        password_hash=hash_password("LockoutPass1!"),
        role="AGENT",
    )
    db.add(lockout_user)
    db.commit()

    # Exhaust all attempts
    for _ in range(5):
        client.post("/api/auth/login", data={"username": "lockout@test.com", "password": "wrong"})

    # Next attempt should be locked
    r = client.post("/api/auth/login", data={"username": "lockout@test.com", "password": "LockoutPass1!"})
    assert r.status_code == 429
    assert "locked" in r.json()["detail"].lower()

    db.delete(lockout_user)
    db.commit()
    # Clear lockout state
    from app.routers.auth import _login_state
    _login_state.pop("lockout@test.com", None)
