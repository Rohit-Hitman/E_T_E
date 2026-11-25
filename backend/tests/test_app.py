from datetime import datetime, timezone

import psycopg
from fastapi.testclient import TestClient

from backend.app import create_app


class FakeCursor:
    def __init__(self, *, row=None, rows=None):
        self.row = row
        self.rows = rows or []

    def fetchone(self):
        return self.row

    def fetchall(self):
        return self.rows


class FakeConnection:
    def __init__(self, database, schema):
        self.database = database
        self.schema = schema

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def execute(self, query, parameters=None):
        if "information_schema.columns" in query:
            return FakeCursor(row=(self.schema["time_type"],))

        if query.lstrip().startswith("ALTER TABLE public.details"):
            for record in self.database:
                record["time"] = datetime.now(timezone.utc)
            self.schema["time_type"] = "timestamp with time zone"
            return FakeCursor()

        if query.lstrip().startswith("INSERT INTO public.details"):
            name = parameters[0]
            inserted_at = datetime.now(timezone.utc)
            self.database.append({"name": name, "time": inserted_at})
            return FakeCursor(row=(name, inserted_at))

        if query.lstrip().startswith('SELECT "Name", "Time"'):
            rows = [
                (record["name"], record["time"])
                for record in self.database
            ]
            return FakeCursor(rows=rows)

        raise AssertionError("Unexpected SQL query")


def test_create_and_list_people(monkeypatch):
    database = [{"name": "Earlier entry", "time": 87}]
    schema = {"time_type": "bigint"}
    monkeypatch.setattr(
        "backend.app.connect_to_database",
        lambda: FakeConnection(database, schema),
    )
    client = TestClient(create_app())

    with client:
        assert schema["time_type"] == "timestamp with time zone"
        assert isinstance(database[0]["time"], datetime)

        response = client.post("/people", json={"name": "  Ada Lovelace  "})
        assert response.status_code == 201
        created = response.json()
        assert created["name"] == "Ada Lovelace"
        inserted_at = datetime.fromisoformat(created["time"])
        assert inserted_at.tzinfo == timezone.utc
        assert database[1]["name"] == "Ada Lovelace"
        assert database[1]["time"] == inserted_at

        listed = client.get("/people")
        assert listed.status_code == 200
        listed_records = listed.json()
        assert [record["name"] for record in listed_records] == [
            "Earlier entry",
            "Ada Lovelace",
        ]
        assert (
            datetime.fromisoformat(listed_records[0]["time"])
            == database[0]["time"]
        )
        assert listed_records[1] == created


def test_validation_and_database_error_handling(monkeypatch):
    database = []
    schema = {"time_type": "timestamp with time zone"}
    calls = 0

    def fail_to_connect():
        nonlocal calls
        calls += 1
        if calls == 1:
            return FakeConnection(database, schema)
        raise psycopg.OperationalError("test connection failure")

    monkeypatch.setattr("backend.app.connect_to_database", fail_to_connect)
    client = TestClient(create_app())

    with client:
        assert client.post("/people", json={"name": "  "}).status_code == 422
        assert client.post("/people", json={"name": "a" * 101}).status_code == 422

        response = client.post("/people", json={"name": "Ada"})
        assert response.status_code == 500
        assert response.json() == {"detail": "A database error occurred."}


def test_frontend_is_served(monkeypatch):
    database = []
    schema = {"time_type": "timestamp with time zone"}
    monkeypatch.setattr(
        "backend.app.connect_to_database",
        lambda: FakeConnection(database, schema),
    )
    client = TestClient(create_app())

    with client:
        page = client.get("/")
        script = client.get("/app.js")

    assert page.status_code == 200
    assert "Remember the names" in page.text
    assert script.status_code == 200
    assert 'request("/people")' in script.text
