# Proposed ten-week rollout

This plan addresses five legacy Vue 2/React applications with approximately 30 screens, one frontend lead, one middle developer, and AI agents. It is a migration proposal, not a completed-work report.

| Task                      | Deliverable and acceptance                                           | Depends on | Owner              |
| ------------------------- | -------------------------------------------------------------------- | ---------- | ------------------ |
| 1. Inventory              | Register of screens, roles, and transitions confirmed by operators   | —          | Middle + agent     |
| 2. Reference scenarios    | Shift recordings and input/output examples cover critical operations | 1          | Lead               |
| 3. Contract               | Snapshot, stream, commands, and errors agreed with backend           | 2          | Lead               |
| 4. Foundation             | CI rejects boundary, type, and responsibility violations             | 3          | Agent; lead review |
| 5. Stream                 | Fault recovery demonstrated by tests                                 | 3, 4       | Lead               |
| 6. Decisions and commands | Cancellation, conflicts, timeouts, and permissions pass E2E          | 5          | Middle             |
| 7. Diagram and queues     | Display matches server state with 1000 vehicles                      | 5          | Middle + agent     |
| 8. Acceptance             | Legacy behaviour matrix has no unexplained differences               | 6, 7       | Lead               |
| 9. Pilot                  | Site accepts shadow operation and a 12-hour run                      | 8          | Lead + middle      |
| 10. Cutover               | Operators trained, rollback tested, old dispatch screens disabled    | 9          | Lead               |

Agents extract routes, network contracts, permission checks, and hidden conditions from legacy code. The middle developer reproduces findings in a browser; the lead confirms critical scenarios with dispatchers. Every behaviour links to source, a recording, and a test. Missing documentation is not evidence that a requirement does not exist.

By the end of week two, deliver the inventory, agreed first-site scope, contract, stream prototype, CI, and pilot acceptance criteria. Weeks 3–6 cover implementation, weeks 7–8 acceptance and performance, week 9 the pilot, and week 10 cutover.

Assign agents bounded changes with acceptance criteria, fixtures, and documentation. A human reviews commands, permissions, state recovery, and contract changes. Each MR describes before/after behaviour, verification evidence, and limitations. Agents do not approve their own MRs; CI must pass.

| Main risk               | First action                                                    |
| ----------------------- | --------------------------------------------------------------- |
| Hidden legacy rules     | Record an operator's shift and validate the behaviour inventory |
| Unreliable event stream | Agree replay/reset semantics and test injected faults           |
| Team capacity           | Freeze minimum first-site scope and reserve pilot time          |

Before launch, do not migrate all 30 screens, build a universal design system, rewrite the backend, or add a geographic map. Disable old dispatch screens only after acceptance and a successful rollback rehearsal.
