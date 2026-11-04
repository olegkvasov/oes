# Architecture

## Ownership and synchronization

`transport` owns the shared HTTP client and WebSocket creation. `dispatch` owns domain types, API access, and screen state. `DispatchContainer` owns requests and errors; `DispatchScreen` receives props and emits command/retry events. Long-lived state currently belongs to a single container. Pinia is installed but unused until a shared consumer requires it.

The container loads the user and snapshot, then connects with `since=seq`. It ignores old sequence numbers and requests a fresh snapshot after a gap or reset. Heartbeats detect a missing final event. Stale connection status remains visible during reconnection; transport errors are separate from command errors. Server timestamps establish a clock offset, and display times use the site's time zone from `/api/me`.

An unresolved `CommandAttempt` retains its immutable intent and sending/unknown/confirmed/rejected status. After a timeout, both retry actions send the original key, version, and body even if stream events have updated the object. Other commands are blocked until the outcome is resolved. Only server responses/events change domain objects. Version checks prevent old HTTP replies from overwriting newer state; command responses received while a snapshot loads are merged by version. A 409 displays the current server object and a conflict message.

## Rendering and interaction

Canvas draws vehicles and loading points in local metres using one animation loop, cancelled on unmount. Stream changes are published to Vue on a 100 ms timer; snapshot and command updates can publish immediately. Map updates use keyed Maps; ordered screen collections are derived separately. Server queue timings and gains are never recalculated by the client.

The desktop workspace uses three columns: loading points, diagram, and decisions. Side lists scroll independently. The decision feed offers 100 items; IntersectionObserver mounts full cards near the viewport. ResizeObserver retains actual heights, keeping long reasons accessible. Focused cards remain mounted, removed-ID caches are pruned, and both observers disconnect on unmount. Client history is pruned to the last hour. Individual vehicle selection remains outside the implemented scope.

The visual direction uses restrained enterprise panels, a graphite header, a dark diagram, native fonts, and state colours. Shared CSS variables in `src/style.css` define surfaces, text, dividers, and action states. Main text is 14 px and secondary text starts at 12 px; mobile decision/queue text uses 16 px. Interactive controls have visible focus, mobile buttons and the name toggle have a 44 px minimum height, and decorative transitions respect reduced-motion preferences.

Truck silhouettes preserve state colours and show movement arrows. Point labels render above vehicles. State filters include an empty-selection recovery action; the name toggle affects vehicle labels only. Decision states include text as well as colour. A skip link provides keyboard access to the workspace. Connection status stays above the diagram; site time sits beside the profile. Browser checks wait for `data-testid="connection-status"` and `data-connected` before measurements. The interface stays in Russian; documentation and report text are English.

## Real API and validation

Zod validates incoming payloads. Moving to a real backend requires configuring the endpoint/proxy, authentication, clock accuracy, and observability while preserving the domain contract. Recovery must also be verified against an independent implementation. The latest ten-minute benchmark is recorded in [the performance report](performance/report.md); it does not replace a 12-hour run. Architecture checks enforce structural rules but cannot replace semantic review.
