# Testing Guide

This document describes how to run backend tests for Grid-Sync.

## Scope

Current automated tests cover authentication endpoints in [backend/tests/test_auth.py](../backend/tests/test_auth.py).

## Prerequisites

- Python virtual environment exists at `backend/venv`.
- Dependencies are installed from `backend/requirements.txt`.

If dependencies are missing, install them:

```bash
cd backend
./venv/bin/pip install -r requirements.txt
```

## Run All Backend Tests

From the `backend` directory:

```bash
./venv/bin/python -m pytest -q
```

From the repository root:

```bash
backend/venv/bin/python -m pytest -q backend/tests
```

## Run a Single Test File

```bash
cd backend
./venv/bin/python -m pytest -q tests/test_auth.py
```

## Run a Single Test Case

```bash
cd backend
./venv/bin/python -m pytest -q tests/test_auth.py::test_signup_success
```

## What Is Tested

- Sign up succeeds for a new user.
- Sign up returns conflict for duplicate email.
- Sign in succeeds with valid credentials.
- Sign in fails for invalid password.
- Sign in fails for unknown user.

## Notes About Virtual Environments

Some shells in this repo use `backend/venv` instead of `backend/.venv`.

If `source backend/.venv/bin/activate` fails, use:

```bash
source backend/venv/bin/activate
```

## Docker Workflow

If backend dependencies or tests change and you want runtime parity, rebuild services:

```bash
docker compose up --build -d
```

Testing itself is currently run through the Python virtual environment rather than inside a Docker test service.
