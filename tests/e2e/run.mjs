import { spawnSync } from 'node:child_process';
for (const scenario of ['normal', 'drop,dup,reorder', 'reset', 'slow', 'stale', 'observer']) {
  console.log(`E2E scenario: ${scenario}`);
  const result = spawnSync(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', '--config', 'tests/playwright.config.ts'],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        SCENARIO: scenario,
        FAULTS: scenario === 'observer' || scenario === 'normal' ? '' : scenario,
        ROLE: scenario === 'observer' ? 'observer' : 'dispatcher',
      },
    },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
