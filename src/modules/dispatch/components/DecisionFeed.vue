<script setup lang="ts">
import { onMounted, onUnmounted, onUpdated, ref, shallowRef } from 'vue';
import type { Decision } from '../helpers/model';

const props = defineProps<{ decisions: Decision[] }>();
defineSlots<{ default(props: { decision: Decision }): unknown }>();
const viewport = ref<HTMLDivElement>();
const visible = shallowRef(new Set<string>());
const heights = shallowRef(new Map<string, number>());
const initialized = ref(false);
const focused = ref<string>();
const observed = new Set<HTMLElement>();
let intersection: IntersectionObserver | undefined;
let resize: ResizeObserver | undefined;

function rendered(id: string, index: number) {
  return visible.value.has(id) || focused.value === id || (!initialized.value && index < 4);
}
function observeSlots() {
  const elements = new Set(
    Array.from(viewport.value?.querySelectorAll<HTMLElement>('[data-decision-slot-id]') ?? []),
  );
  for (const element of observed) {
    if (elements.has(element)) continue;
    intersection?.unobserve(element);
    resize?.unobserve(element);
    observed.delete(element);
  }
  for (const element of elements) {
    if (observed.has(element)) continue;
    observed.add(element);
    intersection?.observe(element);
    resize?.observe(element);
  }
  const ids = new Set(props.decisions.map((d) => d.decision_id));
  for (const id of heights.value.keys()) if (!ids.has(id)) heights.value.delete(id);
  for (const id of visible.value) if (!ids.has(id)) visible.value.delete(id);
  if (focused.value && !ids.has(focused.value)) focused.value = undefined;
}
function focusCard(event: FocusEvent) {
  focused.value = (event.target as HTMLElement).closest<HTMLElement>(
    '[data-decision-slot-id]',
  )?.dataset.decisionSlotId;
}
function leaveFocus(event: FocusEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null))
    focused.value = undefined;
}
onMounted(() => {
  intersection = new IntersectionObserver(
    (entries) => {
      const next = new Set(visible.value);
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.decisionSlotId!;
        if (entry.isIntersecting) next.add(id);
        else next.delete(id);
      }
      visible.value = next;
      initialized.value = true;
    },
    { root: viewport.value, rootMargin: '160px 0px' },
  );
  resize = new ResizeObserver((entries) => {
    let changed = false;
    const next = new Map(heights.value);
    for (const entry of entries) {
      const element = entry.target as HTMLElement;
      const id = element.dataset.decisionSlotId!;
      if (!element.firstElementChild) continue;
      const height = element.getBoundingClientRect().height;
      if (height > 0 && next.get(id) !== height) {
        next.set(id, height);
        changed = true;
      }
    }
    if (changed) heights.value = next;
  });
  observeSlots();
});
onUpdated(observeSlots);
onUnmounted(() => {
  intersection?.disconnect();
  resize?.disconnect();
  observed.clear();
});
</script>
<template>
  <div
    ref="viewport"
    class="decisions-feed"
    role="region"
    aria-label="Лента решений"
    tabindex="0"
    @focusin="focusCard"
    @focusout="leaveFocus"
  >
    <p v-if="!decisions.length" class="feed-empty">Новые решения появятся здесь автоматически</p>
    <div
      v-for="(decision, index) in decisions"
      :key="decision.decision_id"
      :data-decision-slot-id="decision.decision_id"
      :style="
        rendered(decision.decision_id, index)
          ? undefined
          : { height: `${heights.get(decision.decision_id) ?? 300}px` }
      "
    >
      <slot v-if="rendered(decision.decision_id, index)" :decision="decision" />
    </div>
  </div>
</template>
