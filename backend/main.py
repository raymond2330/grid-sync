import os

import psycopg2
import redis
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

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
