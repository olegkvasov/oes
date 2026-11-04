import { it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve('scripts/check-layout.mjs');
function check(files: string[]) {
  const root = mkdtempSync(join(tmpdir(), 'dispatch-layout-'));
  try {
    for (const name of files) {
      const file = join(root, name);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, '');
    }
    return spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
it('allows project documentation and installed upstream skill layouts', () => {
  expect(
    check([
      'documentation/DESIGN.md',
      'tests/unit/example.test.ts',
      '.agents/skills/design/SKILL.md',
      '.agents/skills/design/example.test.ts',
    ]).status,
  ).toBe(0);
});
it('rejects project documentation hidden beside the skills directory', () => {
  const result = check(['.agents/project-notes.md']);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Documentation outside documentation/');
});
it('rejects additional documents and tests at the project root', () => {
  const result = check(['DESIGN.md', 'example.test.ts']);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Documentation outside documentation/');
  expect(result.stderr).toContain('Test or test configuration outside tests/');
});
