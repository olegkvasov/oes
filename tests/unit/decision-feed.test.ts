import { it, expect } from 'vitest';
import { createSSRApp, h } from 'vue';
import * as Vue from 'vue';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { readFileSync } from 'node:fs';
import { renderToString } from 'vue/server-renderer';
import DecisionFeed from '../../src/modules/dispatch/components/DecisionFeed.vue';
import type { Decision } from '../../src/modules/dispatch/helpers/model';

const decisions: Decision[] = Array.from({ length: 100 }, (_, index) => ({
  decision_id: `d-${index}`,
  vehicle_id: 'v-1',
  from_point: 'p-1',
  to_point: 'p-2',
  status: 'executed',
  version: 1,
  gain_s: 140,
  reason: `Причина ${index}`,
  created_at: '2026-11-04T00:00:00Z',
  execute_at: '2026-11-04T00:01:00Z',
}));
it('retains all decision slots while mounting cards only for the initial viewport', async () => {
  const html = await renderToString(
    createSSRApp({
      render: () =>
        h(
          DecisionFeed,
          { decisions },
          {
            default: ({ decision }: { decision: Decision }) =>
              h('article', { 'data-card': decision.decision_id }, decision.reason),
          },
        ),
    }),
  );
  expect(html.match(/data-decision-slot-id=/g)).toHaveLength(100);
  expect(html.match(/data-card=/g)!.length).toBeLessThanOrEqual(8);
  expect(html).toContain('data-card="d-0"');
  expect(html).toContain('data-decision-slot-id="d-99"');
  expect(html).not.toContain('data-card="d-99"');
});
it('shows an empty state when no decisions exist', async () => {
  const html = await renderToString(createSSRApp(DecisionFeed, { decisions: [] }));
  expect(html).toContain('Новые решения появятся здесь автоматически');
  expect(html).not.toContain('data-decision-slot-id');
});

// Mount the real component with a small host renderer to exercise observer
// callbacks and unmount cleanup without opening a browser or a local port.
it('unmounts invisible cards, retains heights, and disconnects observers', async () => {
  const { createRenderer, nextTick, shallowRef, ssrContextKey } = await import('vue');
  const { vi } = await import('vitest');
  type Host = {
    tag: string;
    children: Host[];
    parent: Host | null;
    props: Record<string, unknown>;
    dataset: Record<string, string>;
    firstElementChild: Host | undefined;
    querySelectorAll: () => Host[];
    getBoundingClientRect: () => { height: number };
  };
  function descendants(root: Host): Host[] {
    return root.children.flatMap((child) => [child, ...descendants(child)]);
  }
  function element(tag: string): Host {
    return {
      tag,
      children: [],
      parent: null,
      props: {},
      dataset: {},
      get firstElementChild() {
        return this.children.find((child) => !child.tag.startsWith('#'));
      },
      querySelectorAll() {
        return descendants(this).filter((child) => child.dataset.decisionSlotId);
      },
      getBoundingClientRect: () => ({ height: 280 }),
    };
  }
  const intersections: Observer[] = [];
  const resizes: Observer[] = [];
  class Observer {
    nodes = new Set<Host>();
    disconnected = false;
    constructor(
      readonly callback: (entries: { target: Host; isIntersecting?: boolean }[]) => void,
    ) {}
    observe(node: Host) {
      this.nodes.add(node);
    }
    unobserve(node: Host) {
      this.nodes.delete(node);
    }
    disconnect() {
      this.nodes.clear();
      this.disconnected = true;
    }
  }
  vi.stubGlobal(
    'IntersectionObserver',
    class extends Observer {
      constructor(callback: Observer['callback']) {
        super(callback);
        intersections.push(this);
      }
    },
  );
  vi.stubGlobal(
    'ResizeObserver',
    class extends Observer {
      constructor(callback: Observer['callback']) {
        super(callback);
        resizes.push(this);
      }
    },
  );
  const renderer = createRenderer<Host, Host>({
    createElement: element,
    createText: () => element('#text'),
    createComment: () => element('#comment'),
    setText: () => {},
    setElementText: () => {},
    patchProp(node, key, _previous, value) {
      node.props[key] = value;
      if (key === 'data-decision-slot-id') node.dataset.decisionSlotId = String(value);
    },
    insert(node, parent, anchor) {
      if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
      const index = anchor ? parent.children.indexOf(anchor) : parent.children.length;
      parent.children.splice(index, 0, node);
      node.parent = parent;
    },
    remove(node) {
      if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
      node.parent = null;
    },
    parentNode: (node) => node.parent,
    nextSibling: (node) => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
  });
  // Vitest loads the SSR version of SFCs; compile the same template for the
  // client host renderer so this test exercises its actual v-if/slot behaviour.
  const filename = 'src/modules/dispatch/components/DecisionFeed.vue';
  const { descriptor } = parse(readFileSync(filename, 'utf8'));
  const script = compileScript(descriptor, { id: 'decision-feed-test' });
  const template = compileTemplate({
    source: descriptor.template!.content,
    filename,
    id: 'decision-feed-test',
    compilerOptions: { bindingMetadata: script.bindings },
  });
  expect(template.errors).toEqual([]);
  const clientCode = template.code
    .replace(
      /import \{([^}]+)\} from ["']vue["']/g,
      (_match, bindings: string) => `const {${bindings.replace(/ as /g, ': ')}} = Vue;`,
    )
    .replace('export function render', 'return function render');
  const originalRender = DecisionFeed.render;
  DecisionFeed.render = new Function('Vue', clientCode)(Vue);
  const items = shallowRef(decisions);
  const root = element('root');
  const app = renderer.createApp({
    render: () =>
      h(
        DecisionFeed,
        { decisions: items.value },
        {
          default: ({ decision }: { decision: Decision }) =>
            h('article', { 'data-card': decision.decision_id }, decision.reason),
        },
      ),
  });
  app.provide(ssrContextKey, { modules: new Set() });
  try {
    app.mount(root);
    await nextTick();
    const intersection = intersections[0]!;
    const resize = resizes[0]!;
    expect(intersection.nodes.size).toBe(100);
    expect(descendants(root).filter((node) => node.tag === 'article').length).toBeLessThanOrEqual(
      8,
    );
    intersection.callback(
      [...intersection.nodes].map((target) => ({
        target,
        isIntersecting: ['d-98', 'd-99'].includes(target.dataset.decisionSlotId!),
      })),
    );
    await nextTick();
    const last = [...intersection.nodes].find((node) => node.dataset.decisionSlotId === 'd-99')!;
    expect(descendants(root).filter((node) => node.tag === 'article')).toHaveLength(2);
    resize.callback([{ target: last }]);
    await nextTick();
    const feed = descendants(root).find((node) => node.props.class === 'decisions-feed')!;
    (feed.props.onFocusin as (event: unknown) => void)({ target: { closest: () => last } });
    intersection.callback(
      [...intersection.nodes].map((target) => ({
        target,
        isIntersecting: target.dataset.decisionSlotId === 'd-0',
      })),
    );
    await nextTick();
    expect(last.firstElementChild).toBeDefined();
    (feed.props.onFocusout as (event: unknown) => void)({
      currentTarget: { contains: () => false },
      relatedTarget: null,
    });
    await nextTick();
    expect(last.props.style).toEqual({ height: '280px' });
    expect(last.firstElementChild).toBeUndefined();
    items.value = decisions.map((decision) => ({
      ...decision,
      decision_id: `new-${decision.decision_id}`,
    }));
    await nextTick();
    expect(intersection.nodes.size).toBe(100);
    expect(
      [...intersection.nodes].every((node) => node.dataset.decisionSlotId!.startsWith('new-')),
    ).toBe(true);
  } finally {
    app.unmount();
    DecisionFeed.render = originalRender;
    vi.unstubAllGlobals();
  }
  expect(intersections[0]!.disconnected).toBe(true);
  expect(resizes[0]!.disconnected).toBe(true);
  expect(intersections[0]!.nodes.size).toBe(0);
});
