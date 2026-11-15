# Run the real terrain planner

Keep the supplied data tree in `data/`; the backend logs missing dataset paths
at startup. The local launcher starts FastAPI and Vite together and checks the
real backend health before opening the frontend. No simulated API success is used.

## Daily local startup

From the repository root, run `npm.cmd run dev:local` and keep that terminal open.
Open `http://127.0.0.1:8080`. The launcher uses an existing project `.venv`,
`backend/.venv` or `venv` and reads `.env` if present. It waits up to 90 seconds
for a cold Python/GIS startup. It reuses a healthy terrain backend on port 8000
without stopping it when the launcher exits. A backend started by the launcher
stops with that launcher. It does not install packages or modify data.

If the frontend is already running, use `npm.cmd run dev:backend` to start only
the missing API. `npm.cmd run dev` remains the frontend-only command for hosted
previews. Separate terminals can still be used as below.

Science Waypoint and Route C require this backend too. In Mission Setup, select
the verified science waypoint, check feasibility, then compare routes. A failed
catalog request now shows a retry control; it is not treated as an empty catalog.

## First-time setup (PowerShell)

```powershell
Copy-Item .env.example .env
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt
```

Use an installed Python executable (or `py -3`) if `python` resolves to the
Windows Store alias. Install frontend dependencies with the existing lockfile
workflow described in `team/ARCHITECTURE.md` if `node_modules` is absent.
`requirements-dev.txt` includes the runtime manifest and pytest. Do not replace
missing raster dependencies with synthetic terrain.

Terminal 1, backend:

```powershell
backend/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir backend --env-file .env --host 127.0.0.1 --port 8000
```

Terminal 2, frontend:

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 8080 --strictPort
```

On Unix use `backend/.venv/bin/python` and `npm`. Open
`http://127.0.0.1:8080`. Strict port prevents accidentally using a second Vite
instance on 8081. If a server already owns 8080, use or stop that known server
before starting another one. FastAPI docs are `http://127.0.0.1:8000/docs`.

## API addresses and deployment

- The browser requests `/api/v1/missions/plan` on its **own origin** by default.
- Vite forwards `/api/*` (including `/api/science/*` and MEDA) to `TERRANEXIS_API_PROXY_TARGET`, default
  `http://127.0.0.1:8000`, without rewriting the endpoint path. This target is
  server-only; it is not sent to browsers. An unavailable upstream yields 503.
- `VITE_API_BASE_URL` is an optional public API origin/deployment prefix.
  Leave empty locally. Do not append `/api/v1`; endpoint paths include it.
  Vite reads it at startup/build time: restart/rebuild after changes.
- Production needs either an explicitly configured host reverse proxy for
  `/api/*` to FastAPI, **or** `VITE_API_BASE_URL=https://your-api.example`
  set before building. The development proxy is not a production server.
  An HTTPS page must use an HTTPS public API. A deployed browser's localhost
  refers to the visitor's computer, not the hosted FastAPI server.
- For a separate-origin API set backend `TERRANEXIS_CORS_ORIGINS` to exact
  frontend origins, comma-separated, without paths/trailing slashes. The
  default list contains localhost/127.0.0.1 on 8080/5173. Same-origin proxy
  requests do not require exposing additional browser origins. No wildcard
  origins or `no-cors` workaround is used.
- `TERRANEXIS_DATA_ROOT` optionally overrides `<repo>/data`. Backend shell
  variables or `uvicorn --env-file .env` load backend settings; Vite does not
  configure a separately running Python process automatically.
- The Lovable config package strips custom Vite proxies in its managed sandbox
  mode. For such hosted previews use a reachable HTTPS `VITE_API_BASE_URL` and
  configure that preview's exact frontend origin on FastAPI. Do not assume a
  backend running on your local computer is reachable from the preview host.

## Diagnose without conflating failures

```powershell
curl.exe -i http://127.0.0.1:8000/api/v1/health
curl.exe -i http://127.0.0.1:8080/api/v1/health
cd backend
.venv/Scripts/python.exe -m pytest tests -q
```

Run pytest from `backend` so Python can resolve `app`. Health verifies service
reachability, not terrain dataset completeness; an actual POST must also work.

Connection refused/HTTP 000 means the host/port is unreachable. 404 indicates a
wrong endpoint/proxy route; 422 indicates rejected input; 5xx indicates a
backend/proxy failure. A 200 HTML page or malformed JSON is an invalid API
response, not a route result. Browser fetch errors may also hide a CORS/network
policy rejection: inspect the browser Network/Console panels. Curl cannot
verify browser CORS enforcement or mixed-content behavior. The client classifies
HTTP, connection, configuration and response-validation errors; development
logs include endpoint/origin and status, not request bodies or server traces.
Optional research inputs are evaluated locally and never included in terrain
requests. VO2max <=14, unknown/dry suit basis or missing load inputs leave the
comparison unassessed. Offload 2 N is a valid research value.

## Connection-fix verification (2026-11-14)

The reproduced frontend origin was `http://127.0.0.1:8080` (HTTP 200).
No `VITE_API_BASE_URL` or `TERRANEXIS_API_PROXY_TARGET` environment override
was configured and no local `.env` existed. Before the change the client resolved
the plan request to `http://127.0.0.1:8000/api/v1/missions/plan`; a direct
`/api/v1/health` request there failed to connect (curl error 7, HTTP 000).
The corrected same-origin health and valid mission POST requests on port 8080
returned JSON/HTTP 503 while the real backend remained down. The endpoint is
registered in `backend/app/main.py`; the observed failure was not a 404/422,
an invalid successful response, or a demonstrated browser CORS rejection.
The screenshot's own browser origin was not available in the supplied page
metadata; these addresses describe the terminal reproduction.

A local `backend/.venv` was prepared using the installed Python 3.14. Installing
`backend/requirements-dev.txt` failed first on sandbox socket permissions, then,
after elevated execution, on DNS resolution for `files.pythonhosted.org`
while downloading NumPy. Starting the backend subsequently reported
`No module named uvicorn`. A successful real terrain route and the complete
backend suite therefore remain unverified until dependency installation works.
No mock backend or simulated route was used for network verification.

71 frontend tests, three stdlib backend configuration tests, TypeScript,
the production build, and lint for the new transport/configuration files passed.
UI tests cover retry/recovery, stale-result invalidation, invalid successful
responses, research-input independence, English/Myanmar explanations, and
removal of positioned unit overlays. No browser automation tool was available;
native spinner rendering, browser CORS and mixed-content enforcement were not
visually/browser tested. Configuration tests do not imply CORS browser testing.
