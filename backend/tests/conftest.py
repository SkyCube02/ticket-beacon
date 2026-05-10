import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.auth import hash_password
from app import models

SQLALCHEMY_TEST_URL = "sqlite:///./test_temp.db"

engine = create_engine(SQLALCHEMY_TEST_URL, connect_args={"check_same_thread": False})
TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    session = TestingSession()
    yield session
    session.rollback()
    session.close()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def admin_user(db):
    user = models.User(
        email="admin@test.com",
        full_name="Test Admin",
        password_hash=hash_password("AdminPass1!"),
        role="SYSTEM_ADMIN",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    yield user
    db.delete(user)
    db.commit()


@pytest.fixture
def agent_user(db):
    user = models.User(
        email="agent@test.com",
        full_name="Test Agent",
        password_hash=hash_password("AgentPass1!"),
        role="AGENT",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    yield user
    db.delete(user)
    db.commit()


@pytest.fixture
def admin_token(client, admin_user):
    r = client.post("/api/auth/login", data={"username": "admin@test.com", "password": "AdminPass1!"})
    return r.json()["access_token"]


@pytest.fixture
def agent_token(client, agent_user):
    r = client.post("/api/auth/login", data={"username": "agent@test.com", "password": "AgentPass1!"})
    return r.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}
