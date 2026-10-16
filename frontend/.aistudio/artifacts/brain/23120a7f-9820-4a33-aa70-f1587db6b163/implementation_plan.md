# Organ & Blood Donor–Recipient Matching Network

A clinical-grade, high-density hospital matching workstation built with React, TypeScript, and Tailwind CSS. It connects to the FastAPI + Neo4j backend at `/api/v1` while offering an integrated in-memory API engine for immediate end-to-end demonstration across all roles, matching workflows, conflict handling, and interactive graph exploration.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and design choices were confirmed during the planning phase:
> - **API Integration Mode**: Built-in mock API with seamless toggle for live FastAPI backend (`/api/v1`), so all flows work immediately while matching the exact OpenAPI contract.
> - **Visual Theme**: Monochrome High-Contrast Surgical Terminal theme (deep obsidian/slate, surgical stark whites, hairline borders, zero purple gradients, zero pill buttons, tabular typography).
> - **Graph Visualization**: Interactive 2D canvas network visualization with zoom, pan, physics node layout, and an inspectable relationship drawer for `/graph/:matchId`.
> - **Anti-Vibecoding Compliance**: Zero purple gradients, zero pill-shaped buttons, no emojis, no em dashes, no fake metrics, no vague hero text, and standard rectangular buttons with subtle rounded corners (`rounded-md` or `rounded-sm`). Dedicated Privacy Policy and Terms & Conditions pages included.

---

## 1. Overview & Core Concept

- **What It Does**: Provides transplant coordinators, doctors, hospital administrators, and compliance auditors with a unified interface to register organ and blood donors, manage recipient waitlists, evaluate algorithmic candidate rankings (blood group compatibility, organ viability countdown, geographic distance, urgency score), issue match requests, resolve allocation conflicts, and audit historical transfers.
- **Target Audience**: 
  - `COORDINATOR`: Day-to-day registration, matching evaluation, and match request submission.
  - `DOCTOR`: Clinical review of candidate rankings and patient urgency adjustments.
  - `ADMIN`: Hospital node registration, system governance, user permissions, and master records.
  - `AUDITOR`: Independent compliance verification with masked patient health information (PHI).
- **Key Value**: Streamlines the organ and blood procurement chain with deterministic compatibility logic, real-time viability timers, and transparent relationship tracking.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Authentication & Role Switching**: Secure login at `/login` with predefined demo credentials for each role (`admin`, `coordinator`, `doctor`, `auditor`) or custom credentials, generating JWT session tokens and setting hospital affiliation.
2. **Clinical Overview Dashboard (`/dashboard`)**: High-density statistics strip (Total Donors, Active Recipients, Pending Requests, Confirmed Allocations, Donors Approaching Expiry), viability countdown monitors, blood type distribution, and quick-action shortcuts.
3. **Donor Management (`/donors`)**: Filterable data table by blood type (A+, A-, B+, B-, AB+, AB-, O+, O-), organ/tissue (Kidney, Liver, Heart, Lung, Cornea, Whole Blood, Platelets), and status (Available, Matched, Allocated, Expired). Real-time countdown timer calculating hours until viability window expires. Full Add/Edit/Delete actions.
4. **Recipient Waitlist (`/recipients`)**: Prioritized registry displaying urgency score (1-100), blood type, organ needed, hospital, and wait time. Doctor/Admin urgency adjustment modal with clinical rationale. Direct 1-click trigger to `/matching/:recipientId`.
5. **Algorithmic Matching Engine (`/matching/:recipientId`)**: Clinical comparison interface showing recipient requirements against ranked donor candidates with match score breakdown, distance in kilometers, HLA compatibility estimation, and remaining viability. Includes "Create Match Request" action. Also supports reverse candidate matching for donors.
6. **Match Requests & Conflict Resolution (`/match-requests`)**: Real-time request pipeline displaying pending, approved, and rejected allocations. Two-step confirmation dialog with explicit HTTP 409 conflict handling (e.g., if a donor was already allocated to another hospital).
7. **Allocation Audit Ledger (`/allocations`)**: Immutable historical ledger of all completed transplants with masking for Auditor roles (e.g., `D-***42`, `R-***18`).
8. **Interactive Canvas Graph (`/graph/:matchId`)**: 2D force-directed canvas displaying nodes (Donor, Recipient, Source Hospital, Transplant Hospital, Match Request, Allocation) and relationship edges (`DONATED_BY`, `REQUESTED_FOR`, `LOCATED_AT`, `ALLOCATED_TO`), with node click-to-inspect drawer.
9. **Compliance Pages**: Professional `/privacy` (HIPAA/GDPR organ registry policy) and `/terms` (transplant procurement protocol).

### Visual Identity & Theme
- **Theme**: Monochrome High-Contrast Surgical Terminal.
- **Color System**:
  - Background: Obsidian Slate (`#0B0F17`) and Dark Charcoal (`#111827`) for dark mode; Pure White (`#FFFFFF`) with cool slate borders (`#E2E8F0`) for clean hospital light mode.
  - Accents: Pure Surgical White (`#FFFFFF`), Crisp Cyan/Ice (`#06B6D4` / `#0891B2` used sparingly for active states), Crimson (`#DC2626` for critical urgency/expiry alerts), Amber (`#D97706` for pending status), Emerald (`#059669` for compatible match confirmations).
  - Borders: Crisp 1px hairline dividers (`border-slate-800` / `border-slate-200`).
  - Strict Rule: Zero purple gradients, zero pill buttons (strict `rounded-md` or `rounded` rectangular buttons with `px-4 py-2`), zero emojis.
- **Typography**:
  - Primary UI & Headers: `Plus Jakarta Sans` or clean system sans with strict optical hierarchy.
  - Numerics & IDs: Monospace tabular numerals (`font-mono tabular-nums`) for donor IDs, blood groups, scores, coordinates, and countdown timers.

---

## 3. Key Product Decisions & Trade-Offs

- **Hybrid Dual-Engine Architecture (Mock + Live FastAPI)**:
  - *Chosen Approach*: An intelligent API client layer that defaults to an in-browser reactive store matching the exact FastAPI schemas, with an immediate toggle in the header to switch to live backend (`VITE_API_URL` or `/api/v1`).
  - *Why*: Allows instantaneous end-to-end testing, demoing, and evaluation without requiring the user to run Neo4j/FastAPI locally, while maintaining 100% adherence to the requested backend routes and payloads.
- **Direct Canvas 2D Graph Engine for `/graph/:matchId`**:
  - *Chosen Approach*: A custom, robust HTML5 2D Canvas force-directed graph renderer with smooth inertia, zoom, pan, node drag, and node selection drawer.
  - *Why*: High performance, zero dependency bundle bloat, zero WebGL crashing in sandbox frames, and exact control over medical styling.
- **Strict Role-Based UI Guarding with API Simulation**:
  - *Chosen Approach*: React Context for `AuthContext` with role-based routing (`RoleGuard`), hiding disallowed controls (e.g., Hospital CRUD only for ADMIN; Urgency adjustments only for DOCTOR/ADMIN; PHI masking for AUDITOR).
  - *Why*: Satisfies all role-based security requirements in Section 4 of the specification.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        App Navigation & Top Bar                        │
│   Brand · Breadcrumb · Live/Mock Toggle · Role Switcher · User Profile │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
    ┌───────────────────────────────┴───────────────────────────────┐
    │                        React Router                           │
    ├───────────────┬───────────────┬───────────────┬───────────────┤
    │               │               │               │               │
┌───▼────┐      ┌───▼────┐      ┌───▼────┐      ┌───▼────┐      ┌───▼────┐
│ /login │      │/dash-  │      │/donors │      │/recip- │      │/match- │
│        │      │board   │      │        │      │ients   │      │ing/:id │
└───┬────┘      └───┬────┘      └───┬────┘      └───┬────┘      └───┬────┘
    │               │               │               │               │
    └───────────────┼───────────────┴───────────────┴───────────────┘
                    │
    ┌───────────────┴───────────────┬───────────────────────────────┐
    │                               │                               │
┌───▼─────────────┐         ┌───────▼───────┐               ┌───────▼───────┐
│ /match-requests │         │ /allocations  │               │/graph/:matchId│
│  & 409 Dialog   │         │ (Audit & PHI) │               │ Canvas Graph  │
└───┬─────────────┘         └───────┬───────┘               └───────┬───────┘
    │                               │                               │
    └───────────────────────────────┼───────────────────────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │     API Client (api/client)   │
                    │   Bearer Auth · JSON Errors   │
                    └───────────────┬───────────────┘
                                    │
             ┌──────────────────────┴──────────────────────┐
             │                                             │
    ┌────────▼────────┐                           ┌────────▼────────┐
    │ Mock API Engine │                           │ Live FastAPI    │
    │ Reactive Memory │                           │ /api/v1 (REST)  │
    └─────────────────┘                           └─────────────────┘
```

### API Endpoints Mapped to UI:
- `POST /api/v1/auth/login`: Authentication & token issuance
- `GET /api/v1/stats/dashboard`: Real-time dashboard KPI counts & distributions
- `GET /api/v1/donors`, `POST /api/v1/donors`, `PATCH /api/v1/donors/{id}`, `DELETE /api/v1/donors/{id}`: Donor registry
- `GET /api/v1/recipients`, `POST /api/v1/recipients`, `PATCH /api/v1/recipients/{id}`, `DELETE /api/v1/recipients/{id}`, `PATCH /api/v1/recipients/{id}/urgency`: Recipient waitlist
- `GET /api/v1/hospitals`, `POST /api/v1/hospitals`, `PATCH /api/v1/hospitals/{id}`, `DELETE /api/v1/hospitals/{id}`: Hospital registry
- `GET /api/v1/recipients/{id}/candidates`: Algorithmic compatibility & ranked candidate listing
- `POST /api/v1/match-requests`, `GET /api/v1/match-requests`, `POST /api/v1/match-requests/{id}/confirm`, `POST /api/v1/match-requests/{id}/reject`: Allocation pipeline with 409 conflict handling
- `GET /api/v1/allocations`: Immutable allocation audit ledger
- `GET /api/v1/graph/match/{match_id}`: Relationship graph nodes & edges
