# Assignment: dispatch screen

For the Frontend Lead — Dispatch Interface position. The vacancy document is not included in this repository. Estimated scope: one working day with AI tools, 6–8 hours. Deadline: five days. Interview review: 90 minutes.

This English version preserves the assignment requirements. File paths reflect the user's subsequent relocation: full README and agent instructions at the repository root, other documents under `documentation/`, and tests/runners under `tests/`. This assignment describes acceptance requirements, not implementation status; see [README](../README.md) for verified results and outstanding checks.

## Goal

The system automatically directs vehicles to loading points. Each decision identifies the vehicle, destination, reason, and expected gain. Dispatchers monitor the system rather than approve every decision. They can intervene by cancelling a decision before execution or switching a loading point to manual mode. The screen stays open throughout a shift.

Build the screen with Vue 3 and TypeScript, a mock server, and verification checks. Use an AI coding agent; the scope assumes this. You remain responsible for architecture, verification, and the result.

## Deliverables

| No. | Part | Result |
|---|---|---|
| 1 | [Mock server](#1-mock-server) | `make mock` |
| 2 | [Screen](#2-screen) | `make dev` |
| 3 | [Code rules](#3-code-rules) | `make check` |
| 4 | [Tests](#4-tests) | `make test`, `make e2e` |
| 5 | [Performance](#5-performance) | `make perf` → `documentation/performance/report.md` |
| 6 | [Documentation](#6-documentation) | Root `README.md`, `AGENTS.md`; `documentation/DESIGN.md`, `documentation/PLAN.md` |

## Evaluation

1. Run README commands in a clean clone.
2. Run the screen against both your mock and an independent mock with network faults; compare the display with server state.
3. Introduce a violation of each rule 1–3 in part 3; `make check` must reject each one.
4. During the interview, modify the solution with your agent; our agent also performs a task using your `AGENTS.md`.

## 1. Mock server

`make mock` starts a Node or Python server implementing the contract below: 150 vehicles move between six loading points; decisions arrive every 5–15 seconds and execute 60 seconds after creation. Movement and decision logic can be simple; realism is not evaluated.

| Environment option or endpoint | Behaviour |
|---|---|
| `LOAD=1000` | 1000 vehicles, each updated once per second |
| `FAULTS=drop,dup,reorder` | Drop, duplicate, and reorder WebSocket messages |
| `FAULTS=reset` | Disconnect every two minutes and return `reset` on reconnection |
| `FAULTS=slow` | Delay HTTP by three seconds; some commands execute on the server but time out on the client |
| `FAULTS=stale` | Stop updating some vehicles |
| `ROLE=observer` | `/api/me` returns an observer; commands return 403 |
| `GET /debug/state` | True server state and execution counts for each command's `Idempotency-Key` |

### Contract

Times use ISO 8601 in UTC. Coordinates are local metres on a site approximately 6 × 4 km in size. Example display strings below are English for documentation; the application interface remains Russian.

| Request | Response |
|---|---|
| `GET /api/me` | `{"user_id": "u-7", "name": "A. S. Ivanova", "role": "dispatcher", "site": {"name": "Site 3", "tz": "Asia/Krasnoyarsk"}}`; `role` is `dispatcher` or `observer` |
| `GET /api/snapshot` | `{"seq": 50412, "at": "…", "vehicles": [...], "points": [...], "decisions": [...]}` — state at `seq`, including decisions from the last hour |
| `POST /api/decisions/{id}/cancel` | Headers: `Idempotency-Key` and `If-Match: <version>`. 200: decision with new status; 409: already executed, expired, or version conflict, with the current decision in the body; 403: insufficient permissions |
| `POST /api/points/{id}/mode` | Body: `{"mode": "manual"}`; headers and responses follow the cancellation contract |
| WebSocket `/ws?since=<seq>` | Events after `since`: `{"seq": 50413, "at": "…", "type": "vehicle" \| "point" \| "decision", "data": {…}}`. `data` contains the complete updated object. `seq` increases by one. If the required history is unavailable, send `{"type": "reset"}` and let the client reload a snapshot. Every five seconds send `{"type": "heartbeat", "seq": …, "at": "…"}`, where `at` is server time |

Repeating a command with the same `Idempotency-Key` returns the same response without executing the command again.

Example objects:

```json
{"vehicle_id": "v-17", "name": "T-17", "x_m": 2410.5, "y_m": 1180.0, "heading_deg": 72, "speed_kmh": 24.5,
 "state": "moving_empty", "point_id": "p-2", "last_seen": "2026-10-01T04:12:09Z"}

{"point_id": "p-2", "name": "Point 2", "x_m": 3120, "y_m": 900, "mode": "auto", "version": 14,
 "queue": [{"vehicle_id": "v-09", "eta": "2026-10-01T04:13:40Z", "service_start": "2026-10-01T04:15:10Z", "wait_s": 90}]}

{"decision_id": "d-3381", "vehicle_id": "v-17", "from_point": "p-2", "to_point": "p-4", "gain_s": 140,
 "reason": "Point 2 has four vehicles queued; Point 4 is available", "status": "pending",
 "created_at": "2026-10-01T04:12:05Z", "execute_at": "2026-10-01T04:13:05Z", "version": 1}
```

| Field | Meaning |
|---|---|
| `state` | `moving_loaded`, `moving_empty`, `queued`, `service`, `idle`, `offline` |
| `last_seen` | Most recent vehicle data timestamp |
| `status` | `pending` → `executed`, `cancelled`, or `expired` |
| `reason` | Human-readable text that may contain any characters |
| `version` | Increases on every change; sent in `If-Match` |

## 2. Screen

1. **Site diagram:** loading points and vehicles in real time, state colours, visible stale vehicles.
2. **Queues:** vehicles, estimated arrival, and waiting time for each point.
3. **Decision feed:** newest first; pending decisions show a countdown to `execute_at` and a cancel button.
4. **Point mode:** automatic/manual switch.
5. **Connection:** connected, reconnecting, or stale data.

| No. | Requirement | Verification |
|---|---|---|
| 1 | Queue, wait, and gain values come from the server, without client calculation | Code review |
| 2 | Dropped, duplicated, reordered messages and reset do not cause divergence from the server | E2E: `FAULTS=drop,dup,reorder` for five minutes; `FAULTS=reset` |
| 3 | Each command executes once, including a retry after network failure | E2E: `FAULTS=slow`, cancellation timeout/retry, one execution in `/debug/state` |
| 4 | Display server response state; explain conflicts and show current state | E2E: cancel an already executed decision; receive 409, a message, and `executed` status |
| 5 | Observers see no action buttons; handle 403 | E2E: `ROLE=observer`, no actions; a command bypassing UI permissions is refused; display the refusal when received by the UI |
| 6 | A vehicle with no data for more than 30 seconds of server time appears stale | E2E: `FAULTS=stale` |
| 7 | Use the site's time zone from `/api/me`, not the browser's | `make test` |
| 8 | No external requests; bundle fonts, icons, and diagram assets | Open the screen without internet access |
| 9 | Operate for 12 hours without memory growth or stuttering | `make perf`, with a separate long-duration run |

## 3. Code rules

1. Organize code in `src/modules/<module>/`. Cross-module imports use only the owning module's `index.ts`. No dependency cycles.
2. Containers (`*Container.vue`) own requests, state, and errors. Presentational components display props and emit actions; they make no requests and do not mutate stores.
3. HTTP belongs only in the module's `api` layer through one shared client. Business functions belong in `helpers`; technical functions belong in `utils`.
4. Use Pinia only for shared, long-lived state. Functions that change store state use the `Mutator` suffix.

`make check` must automatically check rules 1–3 along with `vue-tsc` types and linting. Violations must fail the check rather than produce warnings. Actual checker coverage and limitations must be disclosed in README.

## 4. Tests

1. `make test` — Vitest: sequence ordering/gaps, snapshot recovery, command state, and site time-zone handling.
2. `make e2e` — Playwright against the mock: all verification scenarios from part 2. After each scenario, screen state matches `/debug/state`.

## 5. Performance

`make perf` opens the screen with Playwright against `LOAD=1000` for ten minutes and writes `documentation/performance/report.md`:

| Metric | Target |
|---|---|
| Long tasks over 50 ms, per minute | At most one per minute |
| Diagram frames per second: mean and fifth percentile | At least 30 |
| JS heap after warm-up and at the end | Growth no greater than 10% |

The default ten-minute benchmark and the 12-hour operating requirement are separate checks. This repository supports the latter with `PERF_MINUTES=720 make perf`.

## 6. Documentation

| File | Contents |
|---|---|
| `README.md` | Commands; completed work and deliberate omissions, with reasons; time spent. AI section: tools, agent/human responsibilities, safeguards, and 2–3 agent mistakes caught by the human and how |
| `AGENTS.md` | Repository instructions for agents: code rules, linked checks, commands, and prohibitions |
| `documentation/DESIGN.md` | Up to two pages: modules and state ownership; snapshots/events and server time; diagram rendering rationale; transition to a real API |
| `documentation/PLAN.md` | Up to two pages addressing the questions below |

For the plan, assume you are the frontend lead with one middle developer, both using AI agents. There are five legacy Vue 2/React applications, approximately 30 screens, and almost no documentation. In ten weeks, the dispatch screen must serve the first site and the old dispatch screens must be disabled.

1. List 8–12 tasks with deliverables, acceptance criteria, dependencies, and an owner: lead, middle, or agent.
2. Explain how to recover undocumented legacy behaviour, including agent assignments and verification against omissions.
3. Define what must be ready by the end of week two.
4. Set team rules for agents: suitable assignments, mandatory verification, and reviewing agent MRs.
5. Identify three main risks and the first action for each.
6. State what will not be done before launch.

## If time runs out

`AGENTS.md` and `PLAN.md` are mandatory. Prioritize API and snapshot/sequence synchronization → decision feed and commands → diagram with `LOAD=1000` → `make check` → E2E → `make perf` → remaining work. List incomplete work in README.
