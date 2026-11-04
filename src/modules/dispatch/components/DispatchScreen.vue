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
  status: string;
  connectionError: string;
  error: string;
  retry: boolean;
  busy: boolean;
  now: number;
  stale: number;
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
  <header class="app-header">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="m4 17 8-12 8 12H4Z" stroke="currentColor" stroke-width="2" />
          <path d="m9 17 3-5 3 5" stroke="currentColor" stroke-width="2" />
        </svg>
      </span>
      <div>ОПЕРАТОР<span>Управление перевозками</span></div>
    </div>
    <div class="header-site">
      <span>{{ me?.site.name ?? 'Загрузка площадки' }}</span>
      <span class="connection" :class="{ connected: status === 'Подключено' }">● {{ status }}</span>
    </div>
    <div class="user-profile">
      <span class="user-avatar" aria-hidden="true">{{ me?.name.charAt(0) ?? '—' }}</span>
      <div>
        {{ me?.name ?? 'Загрузка пользователя'
        }}<span>{{ me?.role === 'observer' ? 'Наблюдатель' : 'Диспетчер' }}</span>
      </div>
    </div>
  </header>
  <main>
    <div class="heading">
      <div>
        <div class="eyebrow">Диспетчерская <span>/</span> Мониторинг</div>
        <h1>Обзор площадки</h1>
        <p>Техника, пункты погрузки и решения в реальном времени</p>
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
    <section class="metrics" aria-label="Показатели площадки">
      <article>
        <small>Техника на площадке</small>
        <strong>{{ state?.vehicles.length ?? '—' }} <em>машин</em></strong>
        <span class="metric-note">Общий парк</span>
      </article>
      <article>
        <small>Автоматическое управление</small>
        <strong
          >{{ state?.points.filter((p) => p.mode === 'auto').length ?? '—' }}
          <em>/ {{ state?.points.length ?? '—' }}</em></strong
        >
        <span class="metric-note">Пункты в авторежиме</span>
      </article>
      <article :class="{ 'metric-attention': pending > 0 }">
        <small>Решения к исполнению</small><strong>{{ pending }}</strong>
        <span class="metric-note">Ожидают отправки техники</span>
      </article>
      <article :class="{ 'metric-warning': stale > 0 }">
        <small>Устаревшие данные</small><strong data-testid="stale-count">{{ stale }}</strong>
        <span class="metric-note">Нет обновлений более 30 секунд</span>
      </article>
    </section>
    <div class="workspace">
      <div class="site-column">
        <section class="panel map-panel" aria-labelledby="map-title">
          <div class="section-title">
            <div>
              <span class="section-kicker">ПЛОЩАДКА / 01</span>
              <h2 id="map-title">Схема движения</h2>
            </div>
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
            </p>
          </div>
          <div class="map-footer">
            <p class="legend">
              <span class="legend-arrow" aria-hidden="true">↗</span> Направление движения
              <span class="legend-divider">·</span> Серый — устаревшие данные
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
              <span class="section-kicker">ИНФРАСТРУКТУРА / 02</span>
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
            <span class="section-kicker">АВТОМАТИКА / 03</span>
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
                ><span class="vehicle-symbol" aria-hidden="true">↗</span
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
      <span>ОПЕРАТОР / Диспетчерская</span><span>Координаты в локальной системе площадки</span>
    </div>
  </main>
</template>
