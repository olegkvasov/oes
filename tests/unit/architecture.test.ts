import { it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
function check(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'dispatch-rules-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      const file = join(root, 'src', name);
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, content);
    }
    return spawnSync(process.execPath, ['scripts/check-architecture.mjs', join(root, 'src')], {
      encoding: 'utf8',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
it('отклоняет прямой импорт внутреннего файла другого модуля', () => {
  const result = check({ 'modules/a/index.ts': "import {x} from '../b/helpers/x';" });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Межмодульный импорт');
});
it('отклоняет импорт API в презентационном компоненте', () => {
  const result = check({
    'modules/a/components/Card.vue': "<script setup>import {get} from '../api/service';</script>",
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Компонент');
});
it('отклоняет fetch вне общего клиента', () => {
  const result = check({ 'modules/a/helpers/load.ts': "fetch('/api/snapshot');" });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Сетевой доступ');
});
it('отклоняет общий HTTP-клиент вне api', () => {
  const result = check({
    'modules/a/helpers/load.ts': "import {request as load} from '../../transport';",
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('только в api');
});
it('обнаруживает цикл через публичные точки входа', () => {
  const result = check({
    'modules/a/index.ts': "import '../b';",
    'modules/b/index.ts': "import '../a';",
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Цикл');
});
it('разрешает общий клиент в api', () => {
  expect(
    check({ 'modules/a/api/service.ts': "import {request} from '../../transport';" }).status,
  ).toBe(0);
});
it('отклоняет namespace-доступ к HTTP из helpers', () => {
  expect(
    check({
      'modules/a/helpers/load.ts':
        "import * as transport from '../../transport'; export const load=()=>transport.request('/api');",
    }).status,
  ).toBe(1);
});
it('отклоняет динамический импорт внутренностей', () => {
  expect(
    check({
      'modules/a/index.ts': "export const load=()=>import('../b/helpers/value');",
      'modules/b/helpers/value.ts': 'export const value=1;',
    }).status,
  ).toBe(1);
});
it('отклоняет цикл внутри одного модуля', () => {
  expect(
    check({
      'modules/a/helpers/one.ts': "import './two';",
      'modules/a/helpers/two.ts': "import './one';",
    }).status,
  ).toBe(1);
});
it('отклоняет функции вне предусмотренных слоёв', () => {
  expect(check({ 'modules/a/calculate.ts': 'export function calculate(){return 1;}' }).status).toBe(
    1,
  );
});
it('отклоняет API, спрятанный за публичным реэкспортом', () => {
  expect(
    check({
      'modules/a/components/View.vue': "<script setup>import {load} from '../../b';</script>",
      'modules/b/index.ts': "export {load} from './api/load';",
      'modules/b/api/load.ts': 'export const load=()=>1;',
    }).status,
  ).toBe(1);
});
