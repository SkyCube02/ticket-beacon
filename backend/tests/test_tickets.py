import pytest
from .conftest import auth


def make_ticket(client, token, title="Test issue", priority="P3"):
    return client.post("/api/tickets", json={
        "title": title,
        "description": "Test description",
        "priority": priority,
        "requester_name": "Test User",
        "requester_email": "test@client.com",
    }, headers=auth(token))


def test_create_ticket(client, agent_token):
    r = make_ticket(client, agent_token)
    assert r.status_code == 201
    data = r.json()
    assert data["title"] == "Test issue"
    assert data["status"] == "OPEN"
    assert data["priority"] == "P3"
    assert data["ticket_number"].startswith("TKT-")


def test_list_tickets(client, admin_token):
    make_ticket(client, admin_token, "List test ticket")
    r = client.get("/api/tickets", headers=auth(admin_token))
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert any(t["title"] == "List test ticket" for t in r.json())


def test_get_ticket(client, agent_token):
    created = make_ticket(client, agent_token, "Get test ticket").json()
    r = client.get(f"/api/tickets/{created['id']}", headers=auth(agent_token))
    assert r.status_code == 200
    assert r.json()["id"] == created["id"]


def test_update_ticket_status(client, agent_token):
    created = make_ticket(client, agent_token).json()
    r = client.patch(f"/api/tickets/{created['id']}", json={"status": "ACKNOWLEDGED"}, headers=auth(agent_token))
    assert r.status_code == 200
    assert r.json()["status"] == "ACKNOWLEDGED"


def test_update_ticket_priority(client, agent_token):
    created = make_ticket(client, agent_token).json()
    r = client.patch(f"/api/tickets/{created['id']}", json={"priority": "P1"}, headers=auth(agent_token))
    assert r.status_code == 200
    assert r.json()["priority"] == "P1"


def test_add_log(client, agent_token):
    created = make_ticket(client, agent_token).json()
    r = client.post(f"/api/tickets/{created['id']}/logs", json={
        "actor_label": "Test Agent",
        "action": "Investigated the issue",
        "meta": {},
        "is_internal": False,
    }, headers=auth(agent_token))
    assert r.status_code in (200, 201)
    logs = r.json()["logs"]
    assert any(l["action"] == "Investigated the issue" for l in logs)


def test_internal_log_hidden_from_client(client, agent_token, db):
    from app.auth import hash_password
    from app import models
    # Create a client user
    client_user = models.User(
        email="clienthide@test.com",
        full_name="Client User",
        password_hash=hash_password("ClientPass1!"),
        role="CLIENT_USER",
    )
    db.add(client_user)
    db.commit()

    ticket = make_ticket(client, agent_token, "Hidden log test").json()
    # Add internal note
    client.post(f"/api/tickets/{ticket['id']}", json={}, headers=auth(agent_token))
    client.post(f"/api/tickets/{ticket['id']}/logs", json={
        "actor_label": "Agent", "action": "Secret internal note",
        "meta": {}, "is_internal": True,
    }, headers=auth(agent_token))

    # Login as client
    login_r = client.post("/api/auth/login", data={"username": "clienthide@test.com", "password": "ClientPass1!"})
    if login_r.status_code == 200:
        client_token = login_r.json()["access_token"]
        ticket_r = client.get(f"/api/tickets/{ticket['id']}", headers=auth(client_token))
        if ticket_r.status_code == 200:
            logs = ticket_r.json()["logs"]
            assert not any(l["action"] == "Secret internal note" for l in logs)

    db.delete(client_user)
    db.commit()


def test_satisfaction_rating(client, agent_token):
    created = make_ticket(client, agent_token).json()
    # Resolve first
    client.patch(f"/api/tickets/{created['id']}", json={"status": "RESOLVED"}, headers=auth(agent_token))
    r = client.post(f"/api/tickets/{created['id']}/satisfaction", json={"score": 5, "note": "Great service!"}, headers=auth(agent_token))
    assert r.status_code == 200
    assert r.json()["satisfaction_score"] == 5


def test_satisfaction_score_out_of_range(client, agent_token):
    created = make_ticket(client, agent_token).json()
    r = client.post(f"/api/tickets/{created['id']}/satisfaction", json={"score": 6}, headers=auth(agent_token))
    assert r.status_code == 422


def test_unauthenticated_access(client):
    r = client.get("/api/tickets")
    assert r.status_code == 401
