from celery import shared_task


@shared_task(name="grid_sync.ping")
def ping() -> str:
    return "pong"
