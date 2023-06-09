from prisma import Prisma
from prisma.enums import JobState
from prisma.models import PredictionJob, User
import threading
import queue
import datetime
import logging
import os
import asyncio


from .predict_llm import (
    validate_question,
    MODEL_COSTS,
    MODEL_RUN_FUNCTIONS,
    MODELS_DEMO_SUPPORTED,
)

MAX_DAILY_DEMO_USES = int(os.environ.get("MAX_DAILY_DEMO_USES", "100"))


async def get_demo_key_recent_uses(prisma: Prisma):
    return await prisma.predictionjob.count(
        where={
            "creditCost": 0,
            "createdAt": {"gte": datetime.datetime.now() - datetime.timedelta(days=1)},
            "state": JobState.COMPLETE,
        }
    )


async def run_job(prisma: Prisma, user: User, job: PredictionJob):
    logging.info(
        f'Got job {job.id} "{job.question}" for user {user.id} ({user.credits} credits)'
    )
    await prisma.predictionjob.update(
        where={"id": job.id}, data={"state": JobState.RUNNING}
    )

    model_name = job.modelName
    if model_name not in MODEL_RUN_FUNCTIONS:
        await prisma.predictionjob.update(
            where={"id": job.id},
            data={
                "state": JobState.ERROR,
                "errorMessage": f"Model {model_name} is not supported.",
            },
        )
        return

    model_cost = MODEL_COSTS[model_name]

    if user.credits >= model_cost:
        is_demo = False
    else:
        is_demo = True

    demo_key_uses = await get_demo_key_recent_uses(prisma)
    logging.info(
        f"Running job {job.id} (cost: {model_cost}, model: {model_name}) (demo: {is_demo}, demo uses: {demo_key_uses}, max: {MAX_DAILY_DEMO_USES})"
    )

    if is_demo and model_name not in MODELS_DEMO_SUPPORTED:
        await prisma.predictionjob.update(
            where={"id": job.id},
            data={
                "state": JobState.ERROR,
                "errorMessage": f"Sorry OpenAI is expensive! Model `{model_name}` is not supported in demo mode, change models or buy predictions and retry.",
            },
        )
        return
    elif is_demo and (demo_key_uses > MAX_DAILY_DEMO_USES):
        await prisma.predictionjob.update(
            where={"id": job.id},
            data={
                "state": JobState.ERROR,
                "errorMessage": "Sorry OpenAI is expensive! The daily limit of free uses has run out, buy more predictions, switch models, or try again.",
            },
        )
        return

    try:
        validation_error, error_explantion = validate_question(job.question)
    except Exception as e:
        logging.error(e)
        await prisma.predictionjob.update(
            where={"id": job.id},
            data={
                "state": JobState.ERROR,
                "errorMessage": "Exception " + str(type(e)),
            },
        )
        return
    if validation_error:
        await prisma.predictionjob.update(
            where={"id": job.id},
            data={
                "state": JobState.ERROR,
                "errorMessage": error_explantion,
            },
        )
        return

    agent_queue = queue.Queue()

    def log_callback(text: str):
        agent_queue.put((None, text))

    run_model = MODEL_RUN_FUNCTIONS[model_name]
    try:

        def _run():
            result = run_model(job.modelTemperature / 100, job.question, log_callback)
            agent_queue.put((result, None))

        thread = threading.Thread(target=_run)
        thread.start()
        while True:
            p, log_text = agent_queue.get(timeout=300)
            if log_text:
                await prisma.predictionjoblog.create(
                    data={"logText": log_text, "jobId": job.id}
                )
            if p:
                break
        await prisma.predictionjob.update(
            where={"id": job.id},
            data={
                "state": JobState.COMPLETE,
                "resultProbability": p,
                "creditCost": 0 if is_demo else model_cost,
            },
        )
        if not is_demo:
            await prisma.user.update(
                where={"id": user.id},
                data={"credits": user.credits - MODEL_COSTS[model_name]},
            )
    except Exception as e:
        logging.error(e)
        await prisma.predictionjob.update(
            where={"id": job.id},
            data={
                "state": JobState.ERROR,
                "errorMessage": "Exception: " + str(type(e)),
            },
        )


async def main():
    logging.info("Starting worker")
    prisma = Prisma()
    await prisma.connect()

    while True:
        pending_jobs = await prisma.predictionjob.find_many(
            where={"state": JobState.PENDING}, include={"user": True}
        )
        for job in pending_jobs:
            await run_job(prisma, job.user, job)
        await asyncio.sleep(30)

    await prisma.disconnect()
