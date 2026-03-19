FROM python:3.11-slim-bookworm AS builder

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt

RUN pip install --upgrade pip \
  && pip wheel --wheel-dir /wheels -r /app/requirements.txt


FROM python:3.11-slim-bookworm AS runtime

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
  PYTHONUNBUFFERED=1 \
  PIP_NO_CACHE_DIR=1

RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends libpq5 curl tini \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home --shell /usr/sbin/nologin --uid 10001 appuser

COPY --from=builder /wheels /wheels
COPY --from=builder /app/requirements.txt /app/requirements.txt

RUN pip install --upgrade pip \
  && pip install --no-index --find-links=/wheels -r /app/requirements.txt \
  && rm -rf /wheels

COPY . /app

RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

ENTRYPOINT ["/usr/bin/tini", "--"]
