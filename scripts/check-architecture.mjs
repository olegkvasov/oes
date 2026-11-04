import ts from 'typescript';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
const files = [];
function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|vue)$/.test(p)) files.push(p);
  }
}
walk(process.argv[2] ?? 'src');
const errors = [];
const graph = new Map();
const fileGraph = new Map();
const absoluteFiles = new Set(files.map((file) => path.resolve(file)));
function resolveFile(file, spec) {
  const base = spec.startsWith('@/')
    ? path.resolve(process.argv[2] ?? 'src', spec.slice(2))
    : path.resolve(path.dirname(file), spec);
  return (
    [base, base + '.ts', base + '.vue', path.join(base, 'index.ts')].find((p) =>
      absoluteFiles.has(p),
    ) ?? base
  );
}

const moduleOf = (p) => p.replaceAll('\\', '/').match(/src\/modules\/([^/]+)/)?.[1];
for (const file of files) {
  let source = readFileSync(file, 'utf8');
  const component = file.endsWith('.vue') && !file.endsWith('Container.vue');
  if (file.endsWith('.vue')) source = source.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? '';
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const owner = moduleOf(file);
  const deps = graph.get(owner) ?? new Set();
  if (owner) graph.set(owner, deps);
  function fail(message) {
    errors.push(`${file}: ${message}`);
  }
  const edges = new Set();
  fileGraph.set(path.resolve(file), edges);
  function dependency(value, node) {
    const resolved = resolveFile(file, value);
    if (absoluteFiles.has(resolved)) edges.add(resolved);
    const target = moduleOf(resolved);
    if (
      owner &&
      target &&
      target !== owner &&
      !resolved.endsWith(`/modules/${target}/index.ts`) &&
      !resolved.endsWith(`/modules/${target}`)
    )
      fail('Межмодульный импорт только через index.ts');
    if (component && /\/api(?:\/|$)|store|pinia|transport/i.test(value))
      fail('Компонент не должен импортировать API/store');
    if (/(?:^|\/)transport(?:\/index(?:\.ts)?)?$/.test(value) && !file.includes('/api/')) {
      const named = ts.isImportDeclaration(node) && node.importClause?.namedBindings;
      const errorOnly =
        named &&
        ts.isNamedImports(named) &&
        named.elements.every((e) => (e.propertyName ?? e.name).text === 'HttpError');
      if (!errorOnly) fail('HTTP/WS клиент разрешён только в api');
    }
  }
  function visit(node) {
    if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
      !file.endsWith('.vue') &&
      !/\/(helpers|utils|api|stores?)\//.test(file) &&
      owner
    )
      fail('Функции и классы должны находиться в helpers/utils/api/store');
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        node.expression.getText(ast) === 'require') &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      dependency(node.arguments[0].text, node);
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const spec = node.moduleSpecifier;
      if (spec && ts.isStringLiteral(spec)) {
        const value = spec.text;
        dependency(value, node);
        const resolved = path.normalize(path.join(path.dirname(file), value));
        const target = moduleOf(resolved);
        if (owner && target && target !== owner) {
          deps.add(target);
          if (
            !resolved.endsWith(`src/modules/${target}`) &&
            !resolved.endsWith(`src/modules/${target}/index`) &&
            !resolved.endsWith(`src/modules/${target}/index.ts`)
          )
            fail('Межмодульный импорт только через index.ts');
        }
        if (
          /(?:^|\/)transport(?:\/index(?:\.ts)?)?$/.test(value) &&
          !file.includes('/api/') &&
          ts.isImportDeclaration(node)
        ) {
          const bindings = node.importClause?.namedBindings;
          if (
            bindings &&
            ts.isNamedImports(bindings) &&
            bindings.elements.some((e) =>
              ['request', 'connect'].includes((e.propertyName ?? e.name).text),
            )
          )
            fail('HTTP/WS клиент разрешён только в api');
        }
        if (component && /\/api(?:\/|$)|store|pinia|transport/i.test(value))
          fail('Компонент не должен импортировать API/store');
        if (/axios|ky|ofetch/.test(value) && !file.includes('/transport/api/'))
          fail('HTTP-библиотека вне общего клиента');
      }
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const name = node.expression.getText(ast);
      if (
        /(?:^|\.)(fetch|XMLHttpRequest|WebSocket)$/.test(name) &&
        !file.includes('/transport/api/')
      )
        fail('Сетевой доступ только через общий клиент');
      if (component && /Mutator$|use\w*Store$|request$|command$/.test(name))
        fail('Побочный эффект в компоненте');
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
const active = new Set(),
  done = new Set();
function check(name) {
  if (active.has(name)) {
    errors.push(`Цикл модулей: ${[...active, name].join(' → ')}`);
    return;
  }
  if (done.has(name)) return;
  active.add(name);
  for (const dep of graph.get(name) ?? []) check(dep);
  active.delete(name);
  done.add(name);
}
for (const name of graph.keys()) check(name);
const visitedFiles = new Set(),
  stack = new Set();
function visitFile(file) {
  if (stack.has(file)) {
    errors.push(`Цикл файлов: ${[...stack, file].join(' → ')}`);
    return;
  }
  if (visitedFiles.has(file)) return;
  stack.add(file);
  for (const dep of fileGraph.get(file) ?? []) visitFile(dep);
  stack.delete(file);
  visitedFiles.add(file);
}
for (const file of fileGraph.keys()) visitFile(file);
for (const file of fileGraph.keys()) {
  if (!file.endsWith('.vue') || file.endsWith('Container.vue')) continue;
  const seen = new Set();
  function inspect(dep) {
    if (seen.has(dep)) return;
    seen.add(dep);
    if (/\/(api|stores?)\//.test(dep))
      errors.push(`${file}: Компонент транзитивно зависит от API/store: ${dep}`);
    for (const child of fileGraph.get(dep) ?? []) inspect(child);
  }
  for (const dep of fileGraph.get(file) ?? []) inspect(dep);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log('Архитектурные проверки пройдены');
