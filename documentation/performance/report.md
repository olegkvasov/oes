# Performance

Date: 2026-11-04T16:18:22.208Z
Browser: 156.0.8078.4
1000 vehicles, 10 minutes after a 30-second warm-up, viewport 1440×1000.

| Metric | Result | Target |
|---|---|---|
| Long tasks per minute | 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 | ≤1 per minute |
| FPS mean / p5 | 60.0 / 60.0 | ≥30 |
| Heap after warm-up / at end (bytes) | 4908616 / 5396756 | growth ≤10% |
| Heap growth | 9.94% | ≤10% |
| Decisions in state, start / end | 4 / 66 | diagnostic |
| Cards in DOM, start / end | 4 / 4 | diagnostic |
| DOM nodes, start / end | 504 / 629 | diagnostic |

Result: PASS. FPS counts completed Canvas renders. Measurement tools are initialized before baseline; exported FPS samples are cleared before both heap checkpoints. Heap is measured after forced garbage collection; per-minute heap in memory.json is recorded without GC for diagnostics only. Snapshots before.heapsnapshot / after.heapsnapshot are captured outside the measurement interval; artifacts are stored in tests/.artifacts/performance/. The memory growth threshold is unchanged. This result does not replace a separate 12-hour run.
