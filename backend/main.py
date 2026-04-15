import os
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt
import psycopg2
import redis
from dotenv import load_dotenv
from email_validator import EmailNotValidError, validate_email
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    from app.routers.nasa import router as nasa_router
except ModuleNotFoundError:
    from backend.app.routers.nasa import router as nasa_router

load_dotenv()


def _parse_cors_origins(raw_value: str) -> list[str]:
    return [origin.strip() for origin in raw_value.split(",") if origin.strip()]


def _check_postgres(database_url: str) -> tuple[bool, str]:
    try:
        with psycopg2.connect(database_url, connect_timeout=2) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        return True, "ok"
    except Exception as exc:
        return False, str(exc)


def _check_redis(redis_url: str) -> tuple[bool, str]:
    try:
        client = redis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2)
        client.ping()
        return True, "ok"
    except Exception as exc:
        return False, str(exc)


def _normalize_email(email: str) -> str:
    try:
        return validate_email(email, check_deliverability=False).normalized
    except EmailNotValidError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def _issue_access_token(user: dict[str, Any]) -> str:
    secret_key = os.getenv("JWT_SECRET_KEY", "change-me-in-production")
    algorithm = os.getenv("JWT_ALGORITHM", "HS256")
    expires_minutes = int(os.getenv("JWT_EXPIRES_MINUTES", "60"))
    expires_at = datetime.now(tz=UTC) + timedelta(minutes=expires_minutes)
    payload = {
        "sub": str(user["user_id"]),
        "email": user["email"],
        "role": user["role"],
        "exp": expires_at,
    }
    return jwt.encode(payload, secret_key, algorithm=algorithm)


def _database_url() -> str:
    database_url = os.getenv("DATABASE_URL", "")
    if not database_url:
        raise HTTPException(status_code=500, detail="DATABASE_URL is missing")
    return database_url


def _ensure_user_table(database_url: str) -> None:
    query = """
    CREATE TABLE IF NOT EXISTS "User" (
        user_id SERIAL PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """
    with psycopg2.connect(database_url, connect_timeout=3) as connection:
        with connection.cursor() as cursor:
            cursor.execute(query)
        connection.commit()


def _user_by_email(database_url: str, email: str) -> dict[str, Any] | None:
    query = """
    SELECT user_id, first_name, last_name, email, password_hash, role, created_at
    FROM "User"
    WHERE email = %s
    """
    with psycopg2.connect(database_url, connect_timeout=3) as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, (email,))
            row = cursor.fetchone()
    if row is None:
        return None
    return {
        "user_id": row[0],
        "first_name": row[1],
        "last_name": row[2],
        "email": row[3],
        "password_hash": row[4],
        "role": row[5],
        "created_at": row[6],
    }


def _insert_user(
    database_url: str,
    first_name: str,
    last_name: str,
    email: str,
    password_hash: str,
    role: str,
) -> dict[str, Any]:
    query = """
    INSERT INTO "User" (first_name, last_name, email, password_hash, role)
    VALUES (%s, %s, %s, %s, %s)
    RETURNING user_id, first_name, last_name, email, role, created_at
    """
    with psycopg2.connect(database_url, connect_timeout=3) as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, (first_name, last_name, email, password_hash, role))
            row = cursor.fetchone()
        connection.commit()
    return {
        "user_id": row[0],
        "first_name": row[1],
        "last_name": row[2],
        "email": row[3],
        "role": row[4],
        "created_at": row[5],
    }


class SignUpRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: str
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(default="user", min_length=1, max_length=50)


class SignInRequest(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str
    user_id: int
    first_name: str
    last_name: str
    email: str
    role: str

app = FastAPI(title="Grid-Sync API")

cors_origins = _parse_cors_origins(
    os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(nasa_router)


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "Grid-Sync backend is running"}


@app.get("/health")
def health() -> dict[str, object]:
    database_url = os.getenv("DATABASE_URL", "")
    redis_url = os.getenv("REDIS_URL", os.getenv("CELERY_BROKER_URL", ""))

    db_ok, db_detail = _check_postgres(database_url) if database_url else (False, "DATABASE_URL is missing")
    redis_ok, redis_detail = _check_redis(redis_url) if redis_url else (False, "REDIS_URL is missing")

    payload = {
        "status": "ok" if db_ok and redis_ok else "degraded",
        "checks": {
            "postgres": {"ok": db_ok, "detail": db_detail},
            "redis": {"ok": redis_ok, "detail": redis_detail},
        },
    }

    if not (db_ok and redis_ok):
        raise HTTPException(status_code=503, detail=payload)

    return payload


@app.post("/auth/signup", response_model=AuthResponse, status_code=201)
def signup(payload: SignUpRequest) -> AuthResponse:
    database_url = _database_url()
    _ensure_user_table(database_url)

    normalized_email = _normalize_email(payload.email)
    existing = _user_by_email(database_url, normalized_email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already exists")

    created_user = _insert_user(
        database_url=database_url,
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        email=normalized_email,
        password_hash=_hash_password(payload.password),
        role=payload.role.strip().lower(),
    )
    token = _issue_access_token(created_user)
    return AuthResponse(
        access_token=token,
        token_type="bearer",
        user_id=created_user["user_id"],
        first_name=created_user["first_name"],
        last_name=created_user["last_name"],
        email=created_user["email"],
        role=created_user["role"],
    )


@app.post("/auth/signin", response_model=AuthResponse)
def signin(payload: SignInRequest) -> AuthResponse:
    database_url = _database_url()
    normalized_email = _normalize_email(payload.email)
    user = _user_by_email(database_url, normalized_email)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not _verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = _issue_access_token(user)
    return AuthResponse(
        access_token=token,
        token_type="bearer",
        user_id=user["user_id"],
        first_name=user["first_name"],
        last_name=user["last_name"],
        email=user["email"],
        role=user["role"],
    )
