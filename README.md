# Dispatch monitoring

Vue 3 and TypeScript dispatch screen with a Canvas site diagram and a Node/Fastify/WebSocket mock server. The application interface remains in Russian; documentation and report text are in English.

Requirements: [TASK](documentation/TASK.md). Repository rules: [AGENTS](AGENTS.md). Technical design: [DESIGN](documentation/DESIGN.md). Proposed migration plan: [PLAN](documentation/PLAN.md). Latest measured performance: [report](documentation/performance/report.md).

## Run locally

Use Node.js 24 and Yarn Classic 1.22.22, pinned in `packageManager`.

```sh
yarn install --frozen-lockfile
```

Start `make mock` and `make dev` in separate terminals. Open the Vite URL, normally http://127.0.0.1:5173. The mock listens on port 3001. A Vite proxy error such as `ECONNREFUSED 127.0.0.1:3001` means the backend is not reachable: check that `make mock` is running successfully.

For a manual fault simulation, use `LOAD=1000 FAULTS=drop,dup,reorder make mock`. Other supported modes are described in [TASK](documentation/TASK.md#1-mock-server).

## Implementation

The screen supports snapshot/sequence synchronization, replay/reset recovery, server time, roles, idempotent commands, conflict messages, and stale vehicle detection. Queue timings and gains come from the server; decision reasons are rendered as text. No external fonts, map tiles, or icons are requested.

The desktop workspace fills the available width. Loading points appear on the left, the Canvas diagram in the centre, and system decisions on the right; side lists scroll independently. The diagram shows truck icons, movement arrows, state filters, and an optional vehicle-name layer. Connection status appears above the diagram, and site time appears beside the profile in the header.

After a network failure, both the primary action and the retry button preserve the original command key, version, and body. A different command is blocked until the unknown outcome is resolved. A definitive response allows a new intent with a new key.

The feed offers the latest 100 decisions while creating full cards only near the visible area. Measured heights preserve scrolling and long reasons; a focused card stays mounted. Observers and removed-ID caches are cleaned up. Synchronization state retains the server's last-hour history.

## Verification

| Command      | Purpose                                                            |
| ------------ | ------------------------------------------------------------------ |
| `make check` | Types, ESLint, architecture, file layout, and formatting           |
| `make test`  | Vitest unit/integration checks                                     |
| `make build` | Type checking and production bundle                                |
| `make e2e`   | Playwright: normal, drop/dup/reorder, reset, slow, stale, observer |
| `make perf`  | 1000 vehicles, 30-second warm-up, 10-minute measurement            |

Local checks, all 57 unit/integration tests, and the production build passed during the audit. The supplied complete E2E log confirms all 11 checks passed across six scenarios, including feed virtualization. Each scenario intentionally skips tests assigned to other scenarios; skipped entries do not indicate failures. The drop/dup/reorder scenario runs for five minutes, and reset recovery takes about two minutes.

The performance report dated November 4, 2026 records **PASS**: mean/p5 FPS 60.0/60.0, zero long tasks, and heap growth 9.94% against a 10% limit. The margin is small; this ten-minute result does not establish long-term memory stability. A separate 12-hour run, verification against an independent backend, and a clean installation in a fresh clone remain unconfirmed. The agent environment cannot open the required server ports (EPERM), so browser/performance evidence comes from the user's runs.

Before E2E or performance checks, stop manual development servers and free ports 3001 and 5173. Run these checks sequentially. Install Chromium once, then capture logs:

```sh
yarn playwright install chromium
mkdir -p tests/.artifacts/audit
set -o pipefail
make e2e 2>&1 | tee tests/.artifacts/audit/e2e.log
make perf 2>&1 | tee tests/.artifacts/audit/perf.log
```

The performance runner launches its own headless browser; no manually opened tab needs to stay active. Wait for the final PASS/FAIL and command exit. If it reports an unexpected vehicle count, check for an already running mock or inherited port configuration before rerunning.

For a separate long-duration check:

```sh
PERF_MINUTES=720 make perf
```

The Playwright HTML report is in `tests/.artifacts/report/`; open it with `yarn playwright show-report tests/.artifacts/report`. Direct test invocation uses `yarn playwright test --config tests/playwright.config.ts`, although the runner is needed to exercise all fault modes sequentially.

Performance runs overwrite `documentation/performance/report.md` and diagnostics in `tests/.artifacts/performance/`. Preserve previous results before comparisons. Diagnostics include `memory.json` and `before.heapsnapshot` / `after.heapsnapshot`. Per-minute heap samples are taken without GC; acceptance compares the two checkpoints after forced GC. Measurement tools are initialized before baseline, and exported FPS samples are cleared before both heap checkpoints. Snapshots are captured outside the FPS/long-task measurement interval. Thresholds remain unchanged.

## Limits and deliberate scope

Architecture checks cover static and string dynamic imports, public module boundaries, file/module cycles, component dependencies on API/store layers, network API references including aliases/bind/destructuring, and function placement. Review is still needed to distinguish business functions from technical utilities; the scanner cannot prove arbitrary dynamically generated code correct.

The mock's idempotency-response cache remains in memory until restart. Bounding it requires an agreed retry-guarantee window. Individual vehicle selection is not implemented. The migration plan is a proposal, not a record of completed migration work. No 12-hour stability claim is made from the ten-minute benchmark.

## Working with AI

Codex implemented the application, checks, and documentation. The user selected Canvas, Yarn, and the workspace layout, reviewed the interface, and ran browser/performance checks on their machine. Type checks, lint rules, architecture regression cases, state/command tests, and server comparisons constrain agent changes; human review remains necessary.

Three issues caught by the user during the work:

1. The agent initially stopped before starting the application; the user pointed out that it was not running. Documentation now distinguishes implementation from verified execution.
2. The first user E2E run lacked the required Chromium version. Its log led to an explicit browser-installation command in the setup instructions.
3. An intermediate interface redesign broke the layout; the user reported it, and subsequent changes followed their concrete layout corrections.

Additional architecture-check gaps were found by the agent during the requested audit and covered with regression cases. These are not presented as defects discovered manually by the user.

The observed initial implementation interval on November 2, 2026 was approximately 12:04–13:09 UTC: 65 minutes elapsed, including response waits. Human and agent active time were not tracked separately; this is not a person-hour estimate. Later UI changes and the November 4 audit are outside that interval and have no separate active-time total.

## Repository layout and maintenance

Root `README.md` and `AGENTS.md` contain the full project overview and instructions. Other project Markdown files live in `documentation/`, including the renamed `TASK.md`. Tests, configurations, and runners live in `tests/`; common checks live in `scripts/`. `scripts/check-layout.mjs`, included in `make check`, enforces this layout. Installed upstream skills in `.agents/skills/` are excluded from layout, lint, and formatting checks and are not rewritten with project documentation.

Use only `yarn.lock`. Add dependencies with `yarn add` / `yarn add -D` and retain the updated lockfile. A frozen install over existing `node_modules` does not prove a clean installation; verify that in a fresh clone. Dependency downloads were unavailable in the agent environment.

Use `yarn lint:fix` for fixable lint findings and `yarn format` to format project files. Prettier uses single quotes, two spaces, semicolons, and a 100-column line width. Run `yarn format:check` for a read-only formatting check. Use `yarn run check` for the package check script; `yarn check` is a separate Yarn Classic built-in.
