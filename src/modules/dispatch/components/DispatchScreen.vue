<script setup lang="ts">
import type { Snapshot, Me, Point, Decision, Vehicle, VehicleMapFilter } from '../helpers/model';
import { siteTime } from '../helpers/model';
import SiteScheme from './SiteScheme.vue';
defineProps<{
  state?: Snapshot;
  mapFilter: VehicleMapFilter;
  showVehicleNames: boolean;
  mapVehicles: Vehicle[];
  me?: Me;
  connectionError: string;
  error: string;
  retry: boolean;
  busy: boolean;
  now: number;
  pending: number;
}>();
const emit = defineEmits<{
  command: [kind: 'decisions' | 'points', object: Decision | Point, mode?: Point['mode']];
  retry: [];
  'map-filter': [filter: VehicleMapFilter];
  'show-vehicle-names': [show: boolean];
}>();
const mapFilters: { value: VehicleMapFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'moving_empty', label: 'Порожние' },
  { value: 'moving_loaded', label: 'Гружёные' },
  { value: 'queued', label: 'В очереди' },
  { value: 'service', label: 'На погрузке' },
  { value: 'idle', label: 'Простой' },
  { value: 'offline', label: 'Нет связи' },
  { value: 'stale', label: 'Устаревшие данные' },
];
</script>
<template>
  <a class="skip-link" href="#workspace">К рабочей области</a>
  <header class="app-header">
    <span class="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="m4 17 8-12 8 12H4Z" stroke="currentColor" stroke-width="2" />
        <path d="m9 17 3-5 3 5" stroke="currentColor" stroke-width="2" />
      </svg>
    </span>
    <div class="user-profile">
      <span class="user-avatar" aria-hidden="true">{{ me?.name.charAt(0) ?? '—' }}</span>
      <div>
        {{ me?.name ?? 'Загрузка пользователя'
        }}<span>{{ me?.role === 'observer' ? 'Наблюдатель' : 'Диспетчер' }}</span>
      </div>
    </div>
  </header>
  <main id="workspace" tabindex="-1">
    <div class="heading">
      <div>
        <div class="eyebrow">Диспетчерская <span>/</span> Мониторинг</div>
        <h1>Обзор площадки</h1>
      </div>
      <div class="site-clock">
        <small>Время площадки</small>
        <time>{{ me ? siteTime(new Date(now).toISOString(), me.site.tz) : '—' }}</time>
        <span>{{ me?.site.tz }}</span>
      </div>
    </div>
    <div v-if="connectionError" class="alert" role="status">{{ connectionError }}</div>
    <div v-if="error" class="alert" role="alert">
      {{ error }}
      <button v-if="retry" :disabled="busy" @click="emit('retry')">Повторить команду</button>
    </div>
    <div class="workspace">
      <div class="site-column">
        <section class="panel map-panel" aria-labelledby="map-title">
          <div class="section-title">
            <h2 id="map-title">Мониторинг техники</h2>
            <span class="panel-tag">Локальная схема · 6 × 4 км</span>
          </div>
          <div class="map-filters" role="group" aria-label="Состояние техники на карте">
            <button
              v-for="filter in mapFilters"
              :key="filter.value"
              type="button"
              :aria-pressed="mapFilter === filter.value"
              @click="emit('map-filter', filter.value)"
            >
              <span
                v-if="filter.value !== 'all'"
                class="state-dot"
                :class="filter.value"
                aria-hidden="true"
              ></span>
              {{ filter.label }}
            </button>
          </div>
          <div class="map-view">
            <SiteScheme
              v-if="state"
              :vehicles="mapVehicles"
              :points="state.points"
              :now="now"
              :show-vehicle-names="showVehicleNames"
            />
            <div v-else class="map-loading" role="status">Подключение к площадке…</div>
            <p v-if="state && !mapVehicles.length" class="map-empty" role="status">
              Нет техники с выбранным состоянием
              <button
                v-if="mapFilter !== 'all'"
                class="map-reset"
                type="button"
                @click="emit('map-filter', 'all')"
              >
                Показать всю технику
              </button>
            </p>
          </div>
          <div class="map-footer">
            <p class="legend">
              <span class="legend-arrow" aria-hidden="true">↗</span> Направление движения
              <span class="legend-divider">·</span> Устаревшие данные — приглушённый цвет
            </p>
            <label class="map-names-toggle"
              ><input
                type="checkbox"
                :checked="showVehicleNames"
                @change="emit('show-vehicle-names', ($event.target as HTMLInputElement).checked)"
              />Названия техники</label
            >
          </div>
        </section>
        <section class="panel points-panel" aria-labelledby="points-title">
          <div class="section-title">
            <div>
              <span class="section-kicker">ПУНКТЫ И ОЧЕРЕДИ</span>
              <h2 id="points-title">Пункты погрузки</h2>
            </div>
            <span class="section-caption">Очереди и режимы работы</span>
          </div>
          <div class="points">
            <article
              v-for="p in state?.points"
              :key="p.point_id"
              :data-point-id="p.point_id"
              :data-mode="p.mode"
            >
              <div class="point-heading">
                <h3>{{ p.name }}</h3>
                <span class="mode-badge" :class="p.mode">{{
                  p.mode === 'auto' ? 'Авто' : 'Ручной'
                }}</span>
              </div>
              <div class="point-queue">
                <p v-if="!p.queue.length" class="queue-empty">Очередь свободна</p>
                <p v-for="q in p.queue" :key="q.vehicle_id" class="queue-row">
                  <b>{{
                    state?.vehicles.find((v) => v.vehicle_id === q.vehicle_id)?.name ?? q.vehicle_id
                  }}</b>
                  <span
                    >{{ siteTime(q.eta, me!.site.tz)
                    }}<small>ожидание {{ q.wait_s }} с</small></span
                  >
                </p>
              </div>
              <button
                v-if="me?.role === 'dispatcher'"
                :disabled="busy"
                @click="emit('command', 'points', p, p.mode === 'auto' ? 'manual' : 'auto')"
              >
                {{ p.mode === 'auto' ? 'В ручной режим' : 'В авторежим'
                }}<span aria-hidden="true">↗</span>
              </button>
            </article>
          </div>
        </section>
      </div>
      <aside class="panel decisions-panel" aria-labelledby="decisions-title">
        <div class="section-title">
          <div>
            <span class="section-kicker">АВТОМАТИЧЕСКОЕ РАСПРЕДЕЛЕНИЕ</span>
            <h2 id="decisions-title">Решения системы</h2>
          </div>
          <span class="pending-badge">{{ pending }} ожидают</span>
        </div>
        <div class="decisions-feed">
          <p v-if="state && !state.decisions.length" class="feed-empty">
            Новые решения появятся здесь автоматически
          </p>
          <article
            v-for="d in state?.decisions.slice(0, 100)"
            :key="d.decision_id"
            :data-decision-id="d.decision_id"
            :data-status="d.status"
            class="decision"
          >
            <div class="decision-top">
              <b
                ><span class="vehicle-symbol" aria-hidden="true"
                  ><svg
                    viewBox="0 0 28 22"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linejoin="round"
                  >
                    <path d="M2 3h15l-3 8H5L2 3Zm3 10h14V6h4l3 5v6H4v-4Z" />
                    <circle cx="8" cy="17" r="3" fill="currentColor" />
                    <circle cx="22" cy="17" r="3" fill="currentColor" /></svg></span
                >{{
                  state?.vehicles.find((v) => v.vehicle_id === d.vehicle_id)?.name ??
                  d.vehicle_id.toUpperCase()
                }}</b
              >
              <span class="decision-status" :class="d.status">{{
                {
                  pending: 'Ожидает',
                  executed: 'Исполнено',
                  cancelled: 'Отменено',
                  expired: 'Истекло',
                }[d.status]
              }}</span>
            </div>
            <h3 class="decision-route">
              {{ state?.points.find((p) => p.point_id === d.from_point)?.name ?? d.from_point }}
              <span aria-hidden="true">→</span>
              {{ state?.points.find((p) => p.point_id === d.to_point)?.name ?? d.to_point }}
            </h3>
            <p>{{ d.reason }}</p>
            <div class="gain">
              <span aria-hidden="true">↓</span> Ожидание меньше на {{ d.gain_s }} с
            </div>
            <footer>
              <span>{{
                d.status === 'pending'
                  ? `Исполнение через ${Math.max(0, Math.ceil((Date.parse(d.execute_at) - now) / 1000))} с`
                  : siteTime(d.created_at, me!.site.tz)
              }}</span
              ><button
                v-if="d.status === 'pending' && me?.role === 'dispatcher'"
                :disabled="busy"
                @click="emit('command', 'decisions', d)"
              >
                Отменить
              </button>
            </footer>
          </article>
        </div>
      </aside>
    </div>
    <div class="page-footer">
      <span>Диспетчерская</span><span>Координаты в локальной системе площадки</span>
    </div>
  </main>
</template>
