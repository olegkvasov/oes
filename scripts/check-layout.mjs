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
    if (entry.isDirectory()) {
      if (['e2e', 'perf', 'docs'].includes(file))
        errors.push(`Недопустимый корневой каталог: ${file}`);
      walk(file);
      continue;
    }
    if (
      /\.md$/i.test(file) &&
      !file.startsWith('documentation/') &&
      !['README.md', 'AGENTS.md'].includes(file)
    )
      errors.push(`Документация вне documentation/: ${file}`);
    if (
      /(?:\.(?:test|spec)\.[cm]?[jt]sx?$|(?:playwright|vitest)\.config\.)/.test(file) &&
      !file.startsWith('tests/')
    )
      errors.push(`Тест или его конфигурация вне tests/: ${file}`);
  }
}
walk();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log('Размещение документации и тестов проверено');
