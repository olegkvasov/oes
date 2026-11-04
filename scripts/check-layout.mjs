import { readdirSync } from 'node:fs';
import path from 'node:path';
const ignored = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  'test-results',
  'playwright-report',
  '.artifacts',
  '.yarn',
]);
const errors = [];
function walk(directory = '.') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(directory, entry.name).replaceAll('\\', '/');
    // Installed third-party skills keep their upstream layout and documentation.
    if (file === '.agents/skills') continue;
    if (entry.isDirectory()) {
      if (['e2e', 'perf', 'docs'].includes(file)) errors.push(`Disallowed root directory: ${file}`);
      walk(file);
      continue;
    }
    if (
      /\.md$/i.test(file) &&
      !file.startsWith('documentation/') &&
      !['README.md', 'AGENTS.md'].includes(file)
    )
      errors.push(`Documentation outside documentation/: ${file}`);
    if (
      /(?:\.(?:test|spec)\.[cm]?[jt]sx?$|(?:playwright|vitest)\.config\.)/.test(file) &&
      !file.startsWith('tests/')
    )
      errors.push(`Test or test configuration outside tests/: ${file}`);
  }
}
walk();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log('Documentation and test layout checks passed');
