from fastapi.testclient import TestClient

import main


client = TestClient(main.app)


def _fake_user(password_hash: str) -> dict:
    return {
        "user_id": 1,
        "first_name": "Jane",
        "last_name": "Doe",
        "email": "jane@example.com",
        "password_hash": password_hash,
        "role": "user",
        "created_at": "2026-03-19T00:00:00Z",
    }


def test_signup_success(monkeypatch):
    monkeypatch.setattr(main, "_database_url", lambda: "postgresql://fake")
    monkeypatch.setattr(main, "_ensure_user_table", lambda database_url: None)
    monkeypatch.setattr(main, "_user_by_email", lambda database_url, email: None)
    monkeypatch.setattr(
        main,
        "_insert_user",
        lambda database_url, first_name, last_name, email, password_hash, role: {
            "user_id": 7,
            "first_name": first_name,
            "last_name": last_name,
            "email": email,
            "role": role,
            "created_at": "2026-03-19T00:00:00Z",
        },
    )

    response = client.post(
        "/auth/signup",
        json={
            "first_name": "Jane",
            "last_name": "Doe",
            "email": "jane@example.com",
            "password": "password123",
            "role": "user",
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["email"] == "jane@example.com"
    assert payload["user_id"] == 7
    assert payload["token_type"] == "bearer"
    assert payload["access_token"]


def test_signup_duplicate_email(monkeypatch):
    monkeypatch.setattr(main, "_database_url", lambda: "postgresql://fake")
    monkeypatch.setattr(main, "_ensure_user_table", lambda database_url: None)
    monkeypatch.setattr(main, "_user_by_email", lambda database_url, email: _fake_user("hashed"))

    response = client.post(
        "/auth/signup",
        json={
            "first_name": "Jane",
            "last_name": "Doe",
            "email": "jane@example.com",
            "password": "password123",
            "role": "user",
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Email already exists"


def test_signin_success(monkeypatch):
    hashed = main._hash_password("password123")
    monkeypatch.setattr(main, "_database_url", lambda: "postgresql://fake")
    monkeypatch.setattr(main, "_user_by_email", lambda database_url, email: _fake_user(hashed))

    response = client.post(
        "/auth/signin",
        json={"email": "jane@example.com", "password": "password123"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["email"] == "jane@example.com"
    assert payload["token_type"] == "bearer"
    assert payload["access_token"]


def test_signin_invalid_password(monkeypatch):
    hashed = main._hash_password("password123")
    monkeypatch.setattr(main, "_database_url", lambda: "postgresql://fake")
    monkeypatch.setattr(main, "_user_by_email", lambda database_url, email: _fake_user(hashed))

    response = client.post(
        "/auth/signin",
        json={"email": "jane@example.com", "password": "wrongpass123"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"


def test_signin_unknown_user(monkeypatch):
    monkeypatch.setattr(main, "_database_url", lambda: "postgresql://fake")
    monkeypatch.setattr(main, "_user_by_email", lambda database_url, email: None)

    response = client.post(
        "/auth/signin",
        json={"email": "unknown@example.com", "password": "password123"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"
