import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Annotated

import psycopg
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator


logger = logging.getLogger(__name__)
load_dotenv(Path(__file__).with_name(".env"))


class PersonCreate(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=100)]

    @field_validator("name", mode="before")
    @classmethod
    def trim_name(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class PersonRecord(BaseModel):
    name: str
    time: datetime


def connect_to_database() -> psycopg.Connection:
    return psycopg.connect(
        host=os.getenv("PGHOST", "localhost"),
        port=os.getenv("PGPORT", "5432"),
        dbname=os.getenv("PGDATABASE", "employee"),
        user=os.getenv("PGUSER", "postgres"),
        password=os.getenv("PGPASSWORD"),
    )


def migrate_time_column() -> None:
    with connect_to_database() as connection:
        cursor = connection.execute(
            """
            SELECT data_type
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'details'
              AND column_name = 'Time'
            """
        )
        column = cursor.fetchone()
        if column is None:
            raise RuntimeError('Column "Time" was not found in public.details.')
        if column[0] != "timestamp with time zone":
            connection.execute(
                """
                ALTER TABLE public.details
                ALTER COLUMN "Time" TYPE TIMESTAMPTZ
                USING CURRENT_TIMESTAMP
                """
            )


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(_: FastAPI):
        migrate_time_column()
        yield

    application = FastAPI(title="People API", lifespan=lifespan)

    @application.exception_handler(psycopg.Error)
    async def handle_database_error(
        _: Request, exception: psycopg.Error
    ) -> JSONResponse:
        logger.error(
            "PostgreSQL operation failed: %s",
            exception,
            exc_info=(type(exception), exception, exception.__traceback__),
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "A database error occurred."},
        )

    @application.post("/people", response_model=PersonRecord, status_code=201)
    def create_person(person: PersonCreate) -> PersonRecord:
        with connect_to_database() as connection:
            cursor = connection.execute(
                """
                INSERT INTO public.details ("Name", "Time")
                VALUES (%s, CURRENT_TIMESTAMP)
                RETURNING "Name", "Time"
                """,
                (person.name,),
            )
            row = cursor.fetchone()

        return PersonRecord(name=row[0], time=row[1])

    @application.get("/people", response_model=list[PersonRecord])
    def list_people() -> list[PersonRecord]:
        with connect_to_database() as connection:
            cursor = connection.execute(
                'SELECT "Name", "Time" FROM public.details'
            )
            rows = cursor.fetchall()
        return [
            PersonRecord(name=row[0], time=row[1])
            for row in rows
        ]

    application.mount(
        "/",
        StaticFiles(
            directory=Path(__file__).resolve().parent.parent / "frontend",
            html=True,
        ),
        name="frontend",
    )

    return application


app = create_app()
