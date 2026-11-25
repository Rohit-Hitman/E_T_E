# Architecture

## Overview

Littlecircle is a small, single-service web application. A static frontend
served by FastAPI calls the same FastAPI application's JSON API. The API
validates input and reads or writes records in PostgreSQL.

```text
Browser
  ├── GET /                 -> frontend/index.html
  ├── GET /styles.css       -> frontend/styles.css
  ├── GET /app.js           -> frontend/app.js
  └── /people API requests
        |
        v
FastAPI (backend/app.py)
  ├── validates request/response data
  ├── serves frontend assets
  └── uses psycopg
        |
        v
PostgreSQL: employee.public.details
  ├── "Name" VARCHAR(100)
  └── "Time" TIMESTAMPTZ
```

The frontend and API share an origin, so the browser does not need CORS
configuration or a separate frontend development server.

## Project layout

```text
backend/
  __init__.py
  app.py                 FastAPI application, validation, database access
  requirements.txt       Python dependencies
  .env                   Local database configuration; ignored by Git
  .env.example           Safe configuration template
  tests/
    test_app.py          API and frontend-serving tests
frontend/
  index.html             Page structure
  styles.css             Responsive styling
  app.js                 Form, search, refresh, and API requests
start-the-app.ps1        Dependency/configuration checks and app launcher
README.md                Setup and usage instructions
ARCHITECTURE.md          This document
```

The root `records.db` SQLite file is from the earlier SQLite version and is not
used by the current application.

## Frontend

The frontend is plain HTML, CSS, and JavaScript; it has no separate build step.
FastAPI mounts the `frontend/` directory at `/`.

On page load, `frontend/app.js` requests `GET /people`, sorts results by
insertion time, and renders the directory. The page also supports local name
search and manual refresh. Submitting the form sends a JSON `POST /people`
request and reloads the list when the insert succeeds. Names are inserted into
the DOM as text, not interpreted as HTML.

The interface formats timestamps in the browser's local timezone. The API and
database store timezone-aware timestamps.

## Backend

`backend/app.py` creates the FastAPI application and defines:

- `PersonCreate`: trims names and validates that they contain 1–100 characters.
- `PersonRecord`: response shape containing `name` and timezone-aware `time`.
- `connect_to_database()`: opens a PostgreSQL connection using environment
  settings, loaded from `backend/.env` when present.
- `POST /people`: inserts the name and PostgreSQL `CURRENT_TIMESTAMP`, then
  returns the inserted values.
- `GET /people`: returns all records from `public.details`.
- A PostgreSQL exception handler: logs the underlying database error and
  returns a generic HTTP 500 response.

SQL values are passed as parameters rather than interpolated into query text.
Connections use context managers so write transactions are committed on
success and rolled back on failure.

FastAPI also serves the interactive API documentation at `/docs`.

## Database

The application connects to database `employee` on `localhost:5432` by
default. Connection settings are `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`,
and `PGPASSWORD`. Values in the process environment take precedence over
`backend/.env`.

The expected table is `public.details`:

| Column | PostgreSQL type | Purpose |
| --- | --- | --- |
| `"Name"` | `VARCHAR(100)` | Person's name |
| `"Time"` | `TIMESTAMPTZ` | Record insertion date and time |

The app checks the `"Time"` column during startup. If it is not already
`TIMESTAMPTZ`, it changes the column type and sets existing rows to the
migration timestamp. This intentionally replaces old duration values; a
duration does not contain enough information to recover its original insertion
time. New rows receive `CURRENT_TIMESTAMP` from PostgreSQL.

The `"Name"` column must be `VARCHAR(100)` to hold full names. See the
one-time SQL migration in the [README](./README.md).

## Request and error flow

1. The browser sends a same-origin request to the FastAPI service.
2. FastAPI validates JSON input with Pydantic. Invalid input returns HTTP 422.
3. The route executes a parameterized SQL query against `public.details`.
4. The response is validated and serialized as JSON; timestamps use ISO 8601.
5. PostgreSQL errors are logged server-side and returned as a generic HTTP 500
   response.

## Startup and testing

From the project root, `start-the-app.ps1` installs backend dependencies
(unless `-SkipInstall` is supplied), checks that database settings are present
without printing their values, and runs:

```powershell
python -m uvicorn backend.app:app --reload
```

FastAPI performs the timestamp-column check before serving requests. The
frontend is available at `/`; the JSON API is at `/people`.

Run the backend tests from the project root:

```powershell
python -m pytest backend\tests -v
```

Tests use a fake database connection, so they do not modify PostgreSQL data.
