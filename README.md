# People API

A small FastAPI service that stores names and insertion timestamps in the
PostgreSQL table `public.details`.

## Database configuration

The backend loads database settings from `backend/.env`. The
password belongs in this local file and is ignored by Git. Values already set
in the process environment take precedence over `.env`.

| Variable | Default | Value for this setup |
| --- | --- | --- |
| `PGHOST` | `localhost` | `localhost` |
| `PGPORT` | `5432` | `5432` |
| `PGDATABASE` | `employee` | `employee` |
| `PGUSER` | `postgres` | `postgres` |
| `PGPASSWORD` | None | Set this in `.env` |

`backend/.env.example` is a template. Copy it to `backend/.env` and enter your
PostgreSQL password there. Do not commit or share `.env`.

This is a PostgreSQL database on the server at `localhost:5432`, database
`employee`, schema `public`, table `details`. There is no SQLite database file
used by the application.

The app expects the table columns `"Name"` and `"Time"`. `"Time"` stores the
UTC date and time when the record was inserted.
Since the existing `"Name"` column was created as `char`, change it once in
pgAdmin's Query Tool so it can store full names:

```sql
ALTER TABLE public.details
ALTER COLUMN "Name" TYPE VARCHAR(100);
```

On startup, the app checks `"Time"` and converts it to `TIMESTAMPTZ` if needed.
Existing values are replaced with the migration time (the existing `87` was a
duration, not a recoverable insertion timestamp). New records store PostgreSQL
`CURRENT_TIMESTAMP` in `"Time"`.

## Install and run (PowerShell)

From the project directory, start the complete app with:

```powershell
.\start-the-app.ps1
```

The script installs backend dependencies, checks that the required PostgreSQL
settings are present in `backend/.env` without printing their values, and
starts Uvicorn. Startup applies the timestamp migration and serves the frontend
and API. Open `http://127.0.0.1:8000/` for the frontend or
`http://127.0.0.1:8000/docs` for the API docs. Press `Ctrl+C` to stop.

To skip dependency installation after the first run:

```powershell
.\start-the-app.ps1 -SkipInstall
```

## Project layout

```text
backend/
  api/
    app.py
  requirements.txt
  .env
  tests/
frontend/
  index.html
  styles.css
  app.js
```

## Endpoints

### `POST /people`

Request:

```json
{"name": "Ada Lovelace"}
```

Names are trimmed and must contain 1–100 characters. On success, the endpoint
returns `201 Created` with the name and insertion timestamp:

```json
{"name": "Ada Lovelace", "time": "2026-11-26T01:05:00+00:00"}
```

The `time` response value corresponds to the table's `"Time"` column.

### `GET /people`

Returns the records in `public.details` as a JSON array. Invalid input returns
`422`; PostgreSQL errors return `500`.

## Frontend

The responsive frontend is served by FastAPI at `http://127.0.0.1:8000/`.
It lets you add names, search the directory, refresh the list, and view each
record's insertion time. It uses the same `/people` API and PostgreSQL table;
the files are in `frontend/`, so no separate frontend build is required. The
backend serves this directory.

## Quick API checks (PowerShell)

With Uvicorn running, insert a name and then retrieve the table contents:

```powershell
Invoke-RestMethod `
  -Uri "http://127.0.0.1:8000/people" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"name":"Ada Lovelace"}'

Invoke-RestMethod -Uri "http://127.0.0.1:8000/people" -Method Get
```

Check that a blank name is rejected with HTTP `422`:

```powershell
curl.exe -i -X POST "http://127.0.0.1:8000/people" `
  -H "Content-Type: application/json" `
  --data-raw '{"name":"  "}'
```

## Tests

Run the three tests with:

```powershell
python -m pytest backend\tests -v
```

1. `test_create_and_list_people` checks the `Time` type migration and that a
   name and UTC insertion timestamp are inserted and returned.
2. `test_validation_and_database_error_handling` checks invalid names and
   database connection error responses.
3. `test_frontend_is_served` checks that the frontend page and its script are
   served by FastAPI.

The tests use a fake database connection and do not modify PostgreSQL data.

## Troubleshooting

If the Uvicorn log reports `fe_sendauth: no password supplied`, the
`PGPASSWORD` value is missing from `.env` or is being overridden by an empty
process environment variable. Check `.env` and clear any empty `PGPASSWORD`
variable from the PowerShell window before restarting Uvicorn. If it reports
`relation "public.details" does not exist`, make sure `PGDATABASE` is set to
`employee`, where the table exists. Never put the password in source code or
commit it to the repository.
