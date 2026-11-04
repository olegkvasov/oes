import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const mock = spawn(process.execPath, ['--import', 'tsx', 'mock/server.ts'], {
  env: { ...process.env, LOAD: '1000', FAULTS: '', ROLE: 'dispatcher' },
  stdio: 'inherit',
});
const vite = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--strictPort'],
  { stdio: 'inherit', env: { ...process.env, VITE_PERF: '1' } },
);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
async function ready(url: string) {
  for (let i = 0; i < 60; i++) {
    if (mock.exitCode !== null || vite.exitCode !== null)
      throw new Error('Сервер завершился до начала измерений');
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Сервер не отвечает: ${url}`);
}
try {
  await Promise.all([ready('http://127.0.0.1:3001/api/me'), ready('http://127.0.0.1:5173')]);
  const state = await (await fetch('http://127.0.0.1:3001/debug/state')).json();
  if (state.vehicles.length !== 1000) throw new Error('Ожидалось ровно 1000 машин');
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto('http://127.0.0.1:5173');
  await page.getByText('● Подключено').waitFor();
  await page.waitForTimeout(30000);
  const session = await page.context().newCDPSession(page);
  await session.send('HeapProfiler.collectGarbage');
  const before = await session.send('Runtime.getHeapUsage');
  await page.evaluate(() => {
    const metrics = { longTasks: [] as number[], fps: [] as number[], started: performance.now() };
    Object.assign(window, { __perf: metrics });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        if (entry.duration > 50) metrics.longTasks.push(entry.startTime - metrics.started);
    }).observe({ type: 'longtask' });
    const canvas = (window as unknown as { __canvasPerf?: { samples: number[] } }).__canvasPerf;
    if (!canvas) throw new Error('Canvas instrumentation missing');
    canvas.samples.length = 0;
  });
  const minutes = Number(process.env.PERF_MINUTES ?? 10);
  if (!Number.isInteger(minutes) || minutes < 10 || minutes > 720)
    throw new Error('PERF_MINUTES должен быть от 10 до 720');
  for (let minute = 0; minute < minutes; minute++) {
    await page.waitForTimeout(60000);
    console.log(`Perf: ${minute + 1}/${minutes} минут`);
  }
  const data = await page.evaluate(() => {
    const w = window as unknown as {
      __perf: { longTasks: number[] };
      __canvasPerf: { samples: number[] };
    };
    return { longTasks: w.__perf.longTasks, fps: w.__canvasPerf.samples };
  });
  await session.send('HeapProfiler.collectGarbage');
  const after = await session.send('Runtime.getHeapUsage');
  const fps = data.fps.sort((a, b) => a - b);
  const mean = fps.reduce((a, b) => a + b, 0) / fps.length;
  const p5 = fps[Math.floor(fps.length * 0.05)] ?? 0;
  const counts = Array.from(
    { length: minutes },
    (_, i) => data.longTasks.filter((t) => t >= i * 60000 && t < (i + 1) * 60000).length,
  );
  const growth = (after.usedSize / before.usedSize - 1) * 100;
  const passed = counts.every((count) => count <= 1) && mean >= 30 && p5 >= 30 && growth <= 10;
  await mkdir('documentation/performance', { recursive: true });
  await writeFile(
    'documentation/performance/report.md',
    `# Производительность\n\nДата: ${new Date().toISOString()}\nБраузер: ${browser.version()}\n1000 машин, ${minutes} минут после 30 секунд прогрева, viewport 1440×1000.\n\n| Метрика | Результат | Цель |\n|---|---|---|\n| Long tasks по минутам | ${counts.join(', ')} | ≤1 в минуту |\n| FPS средний / p5 | ${mean.toFixed(1)} / ${p5.toFixed(1)} | ≥30 |\n| Heap после прогрева / в конце | ${before.usedSize} / ${after.usedSize} | рост ≤10% |\n| Рост heap | ${growth.toFixed(2)}% | ≤10% |\n\nРезультат: ${passed ? 'PASS' : 'FAIL'}. FPS измерен счётчиком завершённых отрисовок Canvas. Замер heap выполняется после принудительной сборки мусора. Это не заменяет отдельный прогон продолжительностью 12 часов.\n`,
  );
  if (!passed) process.exitCode = 1;
} finally {
  await browser?.close();
  mock.kill('SIGTERM');
  vite.kill('SIGTERM');
}
