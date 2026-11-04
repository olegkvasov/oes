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
it('rejects direct imports of another module internal file', () => {
  const result = check({ 'modules/a/index.ts': "import {x} from '../b/helpers/x';" });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Cross-module imports');
});
it('rejects API imports in a presentational component', () => {
  const result = check({
    'modules/a/components/Card.vue': "<script setup>import {get} from '../api/service';</script>",
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Component');
});
it('rejects fetch outside the shared client', () => {
  const result = check({ 'modules/a/helpers/load.ts': "fetch('/api/snapshot');" });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Network access');
});
it('rejects shared HTTP client usage outside api', () => {
  const result = check({
    'modules/a/helpers/load.ts': "import {request as load} from '../../transport';",
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('only in api');
});
it('detects a cycle through public entry points', () => {
  const result = check({
    'modules/a/index.ts': "import '../b';",
    'modules/b/index.ts': "import '../a';",
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('cycle');
});
it('allows the shared client in api', () => {
  expect(
    check({ 'modules/a/api/service.ts': "import {request} from '../../transport';" }).status,
  ).toBe(0);
});
it('rejects namespace HTTP access from helpers', () => {
  expect(
    check({
      'modules/a/helpers/load.ts':
        "import * as transport from '../../transport'; export const load=()=>transport.request('/api');",
    }).status,
  ).toBe(1);
});
it('rejects dynamic imports of module internals', () => {
  expect(
    check({
      'modules/a/index.ts': "export const load=()=>import('../b/helpers/value');",
      'modules/b/helpers/value.ts': 'export const value=1;',
    }).status,
  ).toBe(1);
});
it('rejects a cycle within a module', () => {
  expect(
    check({
      'modules/a/helpers/one.ts': "import './two';",
      'modules/a/helpers/two.ts': "import './one';",
    }).status,
  ).toBe(1);
});
it('rejects functions outside permitted layers', () => {
  expect(check({ 'modules/a/calculate.ts': 'export function calculate(){return 1;}' }).status).toBe(
    1,
  );
});
it('rejects API access hidden behind a public re-export', () => {
  expect(
    check({
      'modules/a/components/View.vue': "<script setup>import {load} from '../../b';</script>",
      'modules/b/index.ts': "export {load} from './api/load';",
      'modules/b/api/load.ts': 'export const load=()=>1;',
    }).status,
  ).toBe(1);
});
it.each([
  "const send = fetch; send('/api');",
  "const send = window.fetch.bind(window); send('/api');",
  "const { fetch: send } = globalThis; send('/api');",
  "const send = globalThis['fetch']; send('/api');",
  "const Socket = WebSocket; new Socket('ws://localhost');",
  'const Request = XMLHttpRequest; new Request();',
])('rejects bypassing the shared client through a network API reference: %s', (source) => {
  const result = check({ 'modules/a/helpers/load.ts': source });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Network access');
});
it.each([
  'export const calculate = () => 1;',
  'export const calculate = function () { return 1; };',
  'export const Model = class {};',
])('rejects function and class variables outside permitted layers: %s', (source) => {
  const result = check({ 'modules/a/calculate.ts': source });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Functions and classes');
});
it('allows network API types and functions in permitted layers', () => {
  expect(
    check({
      'modules/a/helpers/value.ts': 'export const value = () => 1; type Socket = WebSocket;',
      'modules/transport/api/client.ts': 'export const send = fetch;',
    }).status,
  ).toBe(0);
});
