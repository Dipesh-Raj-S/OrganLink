# Phase 6 — Frontend ↔ Backend Integration

Status: **complete and verified** (frontend build, backend test suite, and a
27/27 live end-to-end workflow against the running API + Neo4j).

## 1. What this phase delivered

The React/TypeScript/Vite frontend now runs against the real FastAPI + Neo4j
backend in **live mode**, while the original in-browser mock engine remains
fully intact and isolated in **mock mode**. The mode is a runtime toggle — no
code paths were deleted and no behavior of the mock engine was modified.

Integration is implemented as an **adapter layer**, not by rewriting pages:

```
pages / modals (legacy paths + legacy view models)
        │
        ▼
src/api/client.ts        ← liveRequest dispatcher: translates path/payload/
                           response per call, mock engine untouched
        ▼
src/api/adapters.ts      ← backend contract mirrors + pure mapping functions
        ▼
src/api/enums.ts         ← the single shared enum module (verified constants)
```

Key properties:

- Page call-sites keep their legacy endpoint strings; the live dispatcher
  translates them to the real backend routes.
- Missing backend fields became **optional view-model fields that render
  conditionally** — nothing is faked, defaulted, or rescaled.
- Any live-mode failure surfaces the backend error envelope
  `{error: {code, message, details}}` verbatim (no silent fallback to mock).
- A live 401 dispatches `SESSION_EXPIRED_EVENT`; `AuthContext` clears the
  session and redirects (only for non-`/auth/` endpoints).

## 2. Live URL resolution

Precedence (applied in `resolveLiveBaseUrl()`):

1. `VITE_API_URL` if set — used **exactly as provided**, with the `/api/v1`
   suffix appended **at most once**.
2. Otherwise `http://127.0.0.1:8000/api/v1` during development.
3. Otherwise `/api/v1` (same-origin) in production builds.

`frontend/.env.example` documents all three.

## 3. Endpoint translation map (verified against the live API)

| Frontend legacy call             | Live backend route                              | Notes |
|----------------------------------|-------------------------------------------------|-------|
| `POST /match-requests`           | `POST /api/v1/matches/requests`                 | Create body reduced to `donor_id` + `recipient_id` (mock keeps score/notes) |
| `POST /match-requests/{id}/confirm` | `POST /api/v1/matches/requests/{id}/allocate` | Empty `{}` body; single-flight guard in the UI |
| `POST /match-requests/{id}/reject`  | `PATCH /api/v1/matches/requests/{id}/reject`  | Body `{reason}`; pending-only (409 `INVALID_MATCH_STATUS` otherwise) |
| `GET /recipients/{id}/candidates`| `GET /api/v1/matches/recipients/{id}/candidates`| Score → `match_score`, `explanation.factors.distance_km` only (no HLA) |
| `GET /donors/{id}/candidates`    | `GET /api/v1/matches/donors/{id}/candidate-recipients` | Reverse-view candidates (new backend endpoint) |
| `GET /graph/match/{id}`          | `GET /api/v1/graph/matches/{id}`                | New backend endpoint; real Neo4j relationship names |
| `GET /stats/dashboard`           | `GET /api/v1/stats/dashboard`                   | New backend endpoint (`reserved` breakdown row renders when present) |
| donor/recipient/hospital CRUD, list, urgency, allocations, auth | direct (or translated field-by-field) | `location` string overloads become coordinate payloads in live mode |

## 4. Intentional live-vs-mock differences (documented, not hidden)

- **Urgency scale**: live backend is 1–10; mock stays 1–100. Both the
  recipient form and the urgency-update modal show their mode's true
  denominator (`/10` or `/100`). No silent rescaling.
- **Donor expiry**: the live backend stores `registered_at +
  expiry_window_hours`; the UI labels the resulting countdown as a *display
  calculation* and accepts whole hours 1–8760 in the form.
- **No HLA / crossmatch in live scoring**: the backend score is
  ABO 40% / urgency 35% / distance 25% (weights shown in each candidate's
  explanation). HLA is displayed only if a record actually carries it.
- **Donor procurement hospital** is not recorded by the live donor registry —
  the donor form hides the field in live mode and records show coordinates.
- **Recipient enrollment** in live mode requires a real `hospital_id` (select
  populated from `GET /hospitals`, one cached list call per entity type) and
  coordinates pre-filled from the chosen hospital.
- **Name search** is client-side within the current page in live mode because
  the backend supports server-side filters for organ / blood type / status but
  no server-side name search; the UI states this in a caption.
- **Allocation idempotency**: repeating allocation of the *same* match request
  returns the **same allocation record** (backend design). A 409 conflict
  arises when another match claims the donor or the request is not pending —
  both surface as the "conflict" banner, followed by a data refresh.
- **Reject** is ADMIN/COORDINATOR-only, pending-only; repeated rejection and
  confirming a rejected request both yield 409 `INVALID_MATCH_STATUS`.

## 5. Verification actually performed

| Check | Result |
|-----------------------------------------------|-----------|
| `npm run lint` (tsc --noEmit)                 | clean |
| `npm run build` (vite production)             | clean (55 modules) |
| Backend `pytest`                              | **98 passed** (74 pre-existing + 24 added) |
| Live end-to-end script (auth, stats, hospitals list, candidates forward/reverse, donor+recipient creation incl. 422 validation, match create, allocate, idempotent repeat, donor status transition, reject lifecycle, repeat-reject 409, donor unchanged after reject, status filters, graph subgraph shape, urgency 1–10 + 422, error envelope, scratch-record cleanup) | **27/27** |
| Database integrity after verification         | restored to exact seed baseline (50 donors 26/8/8/8, 50 recipients 40/10, MTR-001/002 + ALC-001 intact); no P6- scratch nodes remain |

New backend tests cover: stats coherence/401/threshold; graph subgraph
shape/404/401 + live edges; reverse candidate ranking/pagination/404/400;
reject success/reason persistence/409 transitions (including repeat)/404; RBAC
ADMIN + COORDINATOR permitted, DOCTOR + AUDITOR forbidden; live reject
lifecycle preserving donor availability; live reverse discovery. Scratch test
records created by the live script were removed by id-captured cleanup only —
no seeded record was ever mutated or deleted.

## 6. Notes for running the stack

Backend (needs the Neo4j container up — `docker-compose up -d`):

```bash
cd backend
.venv/Scripts/python scripts/seed.py          # idempotent baseline seed
.venv/Scripts/python -m uvicorn app.main:app --port 8000
```

Frontend:

```bash
cd frontend
npm run dev        # live backend on 127.0.0.1:8000 (or set VITE_API_URL)
```

Mock mode requires no backend and is selected in the login screen (mock
credentials UI), exactly as before this phase.

Seeded accounts: `admin_sys`, `coordinator_sarah`, `dr_chen_transplant`,
`auditor_james` (see `backend/scripts/seed.py`).

## 7. Known limitations

- Donor records carry no hospital linkage in the live backend, so donor cards
  show coordinates rather than a procurement hospital.
- Live candidate matching has no HLA / crossmatch factor; explanations show
  the actual three-factor breakdown only.
- Live name search filters within the currently loaded page (documented cap:
  server responses are paginated; the adapter keeps server totals intact).
- Allocations, match requests and graph nodes historically created by demo
  sessions are not exposed by design beyond what the API returns; the seeded
  demonstration allocation (`ALC-001`) intentionally has no originating
  MatchRequest, which is why `match_id` may be an empty string for it.
