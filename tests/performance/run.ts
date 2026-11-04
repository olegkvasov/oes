import { chromium, type CDPSession } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const minutes = Number(process.env.PERF_MINUTES ?? 10);
if (!Number.isInteger(minutes) || minutes < 10 || minutes > 720)
  throw new Error('PERF_MINUTES must be an integer from 10 to 720');
const artifactDirectory = 'tests/.artifacts/performance';
const mock = spawn(process.execPath, ['--import', 'tsx', 'mock/server.ts'], {
  env: { ...process.env, LOAD: '1000', FAULTS: '', ROLE: 'dispatcher' },
  stdio: 'inherit',
});
const vite = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--strictPort'],
  { stdio: 'inherit', env: { ...process.env, VITE_PERF: '1', VITE_E2E: '0' } },
);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
async function ready(url: string) {
  for (let i = 0; i < 60; i++) {
    if (mock.exitCode !== null || vite.exitCode !== null)
      throw new Error('Server exited before measurements started');
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not respond: ${url}`);
}
async function saveHeap(session: CDPSession, name: string) {
  const chunks: string[] = [];
  const receive = (event: { chunk: string }) => chunks.push(event.chunk);
  session.on('HeapProfiler.addHeapSnapshotChunk', receive);
  try {
    await session.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    await writeFile(`${artifactDirectory}/${name}.heapsnapshot`, chunks.join(''));
  } finally {
    session.off('HeapProfiler.addHeapSnapshotChunk', receive);
  }
}
try {
  await Promise.all([ready('http://127.0.0.1:3001/api/me'), ready('http://127.0.0.1:5173')]);
  const state = await (await fetch('http://127.0.0.1:3001/debug/state')).json();
  if (state.vehicles.length !== 1000) throw new Error('Expected exactly 1000 vehicles');
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto('http://127.0.0.1:5173');
  await page.locator('[data-testid="connection-status"][data-connected="true"]').waitFor();
  await page.getByRole('img', { name: 'Схема площадки: пункты и машины' }).waitFor();
  console.log('Perf: connected; warming up for 30 seconds');
  // Allocate the measurement tools before the baseline, using fixed-size task counters.
  await page.evaluate((minuteCount) => {
    const metrics = { longTasks: Array<number>(minuteCount).fill(0), started: 0 };
    Object.assign(window, { __perf: metrics });
    new PerformanceObserver((list) => {
      if (!metrics.started) return;
      for (const entry of list.getEntries()) {
        const bucket = Math.floor((entry.startTime - metrics.started) / 60000);
        if (entry.duration > 50 && bucket >= 0 && bucket < metrics.longTasks.length)
          metrics.longTasks[bucket]!++;
      }
    }).observe({ type: 'longtask' });
  }, minutes);
  await page.waitForTimeout(30000);
  const session = await page.context().newCDPSession(page);
  await session.send('HeapProfiler.enable');
  await mkdir(artifactDirectory, { recursive: true });
  async function diagnostic(phase: string) {
    const heap = await session.send('Runtime.getHeapUsage');
    const dom = await session.send('Memory.getDOMCounters');
    const counts = await page.evaluate(() => ({
      ...(window as unknown as { __dispatchPerf: { vehicles: number; decisions: number } })
        .__dispatchPerf,
      renderedDecisions: document.querySelectorAll('[data-decision-id]').length,
      decisionSlots: document.querySelectorAll('[data-decision-slot-id]').length,
    }));
    return {
      phase,
      ...counts,
      nodes: dom.nodes,
      documents: dom.documents,
      listeners: dom.jsEventListeners,
      heapBytes: heap.usedSize,
    };
  }
  async function clearFpsSamples() {
    await page.evaluate(() => {
      const canvas = (window as unknown as { __canvasPerf?: { samples: number[] } }).__canvasPerf;
      if (!canvas) throw new Error('Canvas instrumentation missing');
      canvas.samples = [];
    });
  }
  await clearFpsSamples();
  console.log('Perf: saving baseline heap snapshot');
  await saveHeap(session, 'before');
  await clearFpsSamples();
  await session.send('HeapProfiler.collectGarbage');
  const before = await session.send('Runtime.getHeapUsage');
  const diagnostics = [await diagnostic('baseline-after-gc')];
  await page.evaluate(() => {
    const w = window as unknown as {
      __perf: { started: number };
      __canvasPerf: { samples: number[]; frames: number; last: number };
    };
    w.__canvasPerf.samples = [];
    w.__canvasPerf.frames = 0;
    w.__canvasPerf.last = performance.now();
    w.__perf.started = performance.now();
  });
  const measurementStarted = Date.now();
  for (let minute = 0; minute < minutes; minute++) {
    await page.waitForTimeout(
      Math.max(0, (minute + 1) * 60000 - (Date.now() - measurementStarted)),
    );
    const sample = await diagnostic(`minute-${minute + 1}-without-gc`);
    diagnostics.push(sample);
    console.log(
      `Perf: ${minute + 1}/${minutes} minutes; heap=${sample.heapBytes}; DOM=${sample.nodes}; decisions=${sample.decisions}; cards=${sample.renderedDecisions}`,
    );
  }
  const data = await page.evaluate(() => {
    const w = window as unknown as {
      __perf: { longTasks: number[]; started: number };
      __canvasPerf: { samples: number[] };
    };
    w.__perf.started = 0;
    return { counts: w.__perf.longTasks, fps: w.__canvasPerf.samples };
  });
  await clearFpsSamples();
  console.log('Perf: saving final heap snapshot');
  await saveHeap(session, 'after');
  await clearFpsSamples();
  await session.send('HeapProfiler.collectGarbage');
  const after = await session.send('Runtime.getHeapUsage');
  diagnostics.push(await diagnostic('final-after-gc'));
  await writeFile(`${artifactDirectory}/memory.json`, JSON.stringify(diagnostics, null, 2));
  const fps = data.fps.sort((a, b) => a - b);
  const mean = fps.reduce((a, b) => a + b, 0) / fps.length;
  const p5 = fps[Math.floor(fps.length * 0.05)] ?? 0;
  const growth = (after.usedSize / before.usedSize - 1) * 100;
  const passed = data.counts.every((count) => count <= 1) && mean >= 30 && p5 >= 30 && growth <= 10;
  await mkdir('documentation/performance', { recursive: true });
  const baseline = diagnostics[0]!;
  const last = diagnostics[diagnostics.length - 1]!;
  await writeFile(
    'documentation/performance/report.md',
    `# Performance\n\nDate: ${new Date().toISOString()}\nBrowser: ${browser.version()}\n1000 vehicles, ${minutes} minutes after a 30-second warm-up, viewport 1440×1000.\n\n| Metric | Result | Target |\n|---|---|---|\n| Long tasks per minute | ${data.counts.join(', ')} | ≤1 per minute |\n| FPS mean / p5 | ${mean.toFixed(1)} / ${p5.toFixed(1)} | ≥30 |\n| Heap after warm-up / at end (bytes) | ${before.usedSize} / ${after.usedSize} | growth ≤10% |\n| Heap growth | ${growth.toFixed(2)}% | ≤10% |\n| Decisions in state, start / end | ${baseline.decisions} / ${last.decisions} | diagnostic |\n| Cards in DOM, start / end | ${baseline.renderedDecisions} / ${last.renderedDecisions} | diagnostic |\n| DOM nodes, start / end | ${baseline.nodes} / ${last.nodes} | diagnostic |\n\nResult: ${passed ? 'PASS' : 'FAIL'}. FPS counts completed Canvas renders. Measurement tools are initialized before baseline; exported FPS samples are cleared before both heap checkpoints. Heap is measured after forced garbage collection; per-minute heap in memory.json is recorded without GC for diagnostics only. Snapshots before.heapsnapshot / after.heapsnapshot are captured outside the measurement interval; artifacts are stored in ${artifactDirectory}/. The memory growth threshold is unchanged. ${minutes === 720 ? 'A 12-hour run was completed.' : 'This result does not replace a separate 12-hour run.'}\n`,
  );
  console.log(`Perf: ${passed ? 'PASS' : 'FAIL'}; heap growth ${growth.toFixed(2)}% (limit 10%)`);
  if (!passed) process.exitCode = 1;
} finally {
  await browser?.close();
  mock.kill('SIGTERM');
  vite.kill('SIGTERM');
}
