# Repository instructions

Read this file before changing the repository. Requirements are in [documentation/TASK.md](documentation/TASK.md); architecture is described in [documentation/DESIGN.md](documentation/DESIGN.md). Keep the application interface in Russian. Write project documentation, test titles, and generated report text in English.

## Code rules

- Modules live in `src/modules/<module>/`. Import another module only through its public `index.ts`. File and module dependency cycles are forbidden.
- `*Container.vue` files own requests, state, and errors. Presentational components receive props and emit events; they must not make requests or mutate stores.
- HTTP belongs in a module's `api` layer and uses the shared `transport` client. Put business functions in `helpers` and technical functions in `utils`.
- Use Pinia only for shared, long-lived state. Store mutation functions must have the `Mutator` suffix.
- Display server-provided queue, wait, and gain values. Render `reason` as text, never HTML. Use Canvas with local coordinates in metres. Do not add external fonts, map tiles, or CDN resources.
- Retrying a command with an unknown outcome must preserve its `Idempotency-Key`, body, and `If-Match`. A different command must not replace the unresolved attempt. A 409 response must update the affected object.

## Commands and checks

Use Node.js 24 and Yarn Classic 1.22.22. Keep `yarn.lock` as the only package lockfile; do not create `package-lock.json`. Install with `yarn install --frozen-lockfile`.

- Development: `make mock` and `make dev` in separate terminals.
- Verification: `make check`, `make test`, `make build`.
- Browser checks: `yarn playwright install chromium`, then `make e2e` and `make perf` sequentially. Both runners start their own servers; stop manual servers and free ports 3001/5173 first.
- Formatting: `yarn format`, `yarn format:check`; linting: `yarn lint`, `yarn lint:fix`. Format changes before delivery. Do not weaken rules to make checks pass.

`make check` runs vue-tsc, ESLint with zero warnings allowed, architecture/layout checks, and Prettier. Use `yarn run check` for the package script: `yarn check` is a different built-in Yarn Classic command. The assignment and generated performance report are excluded from Prettier.

Architecture checks are implemented in `scripts/check-architecture.mjs` and tested in `tests/unit/architecture.test.ts`. They cover imports, cycles, network API references, component dependencies, and function placement. They do not prove every architectural requirement: distinguishing business logic from technical utilities still requires review, and arbitrary generated code is outside their guarantees. Layout checks are in `scripts/check-layout.mjs` and `tests/unit/layout.test.ts`; ESLint configuration is in `eslint.config.mjs`.

Relevant regression tests:

- Stream recovery and versions: `tests/unit/synchronization.test.ts`, `tests/unit/connection.test.ts`.
- Command intent and HTTP contract: `tests/unit/command.test.ts`, `tests/unit/server.test.ts`.
- Simulation changes: `tests/unit/mock-behavior.test.ts`.
- Connection display and decision virtualization: `tests/unit/dispatch-screen.test.ts`, `tests/unit/decision-feed.test.ts`.

Run appropriate checks before reporting completion. State unverified scenarios explicitly. Never invent performance results or attribute agent-discovered defects to the user. Preserve timestamps and measurements when translating an existing report; translation is not a new test run.

## Test-only controls

`TEST_CONTROL=1` enables test endpoints, `VITE_E2E=1` exposes rendered state for E2E comparisons, and `VITE_PERF=1` exposes performance counters. Never enable these flags in production. After a network error, never generate a new idempotency key when retrying the same intent.

## File placement

- Root `README.md` contains project setup and status. Root `AGENTS.md` contains these full instructions, following the user's relocation of both files.
- All other project documentation, assignments, plans, and Markdown reports belong in `documentation/`. The assignment is `documentation/TASK.md`.
- Unit/integration tests belong in `tests/unit/`, browser tests in `tests/e2e/`, and performance runners in `tests/performance/`. Test configurations and runners also belong in `tests/`; shared code checks belong in `scripts/`.
- Generated browser artifacts belong in `tests/.artifacts/` and must not be committed. The tracked performance report is `documentation/performance/report.md`.
- Do not create root `e2e/` or `perf/` directories, additional root Markdown documents, or tests beside application code. Update imports, configuration, commands, and links after moving files.
- Installed third-party skills in `.agents/skills/` retain their upstream layout and content. They are excluded from layout checks, ESLint, and Prettier. Other project documents in `.agents/` are not exempt.
