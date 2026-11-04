<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import { getMe, getSnapshot, openStream, command, parseEvent } from './api/service';
import { HttpError } from '../transport';
import { isStale, type Snapshot, type Me, type Point, type Decision } from './helpers/model';
import { Synchronization } from './helpers/synchronization';
import { CommandAttempt, createCommandIntent } from './helpers/command';
import DispatchScreen from './components/DispatchScreen.vue';
import type { VehicleMapFilter } from './helpers/model';

const state = shallowRef<Snapshot>();
const me = ref<Me>();
const mapFilter = ref<VehicleMapFilter>('all');
const showVehicleNames = ref(true);
const mapVehicles = computed(() => {
  const vehicles = state.value?.vehicles ?? [];
  if (mapFilter.value === 'all') return vehicles;
  return vehicles.filter((v) =>
    mapFilter.value === 'stale' ? isStale(v, now.value) : v.state === mapFilter.value,
  );
});
const status = ref('Подключение');
const error = ref('');
const connectionError = ref('');
const dataStale = ref(false);
const now = ref(Date.now());
const busy = ref(false);
const retry = ref<() => Promise<void>>();
const sync = new Synchronization();
let ws: WebSocket | undefined;
let disposed = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let clock: ReturnType<typeof setInterval> | undefined;
let offset = 0;
let received = 0;
let generation = 0;
let dirty = false;
let snapshotCommands: (Point | Decision)[] | undefined;
let reconnectAttempt = 0;
const stale = computed(
  () => state.value?.vehicles.filter((v) => isStale(v, now.value)).length ?? 0,
);
const pending = computed(
  () => state.value?.decisions.filter((d) => d.status === 'pending').length ?? 0,
);

function publish() {
  state.value = sync.snapshot(now.value);
  dirty = false;
  if (import.meta.env.VITE_E2E === '1')
    Object.assign(window, { __dispatchState: structuredClone(state.value) });
}
function accept(obj: Point | Decision) {
  snapshotCommands?.push(obj);
  sync.accept(obj);
  publish();
}
function scheduleRecovery() {
  if (disposed) return;
  clearTimeout(timer);
  status.value = dataStale.value ? 'Данные устарели · переподключение' : 'Переподключение';
  timer = setTimeout(() => void recover(), Math.min(1000 * 2 ** reconnectAttempt++, 15000));
}
async function recover() {
  if (disposed) return;
  const token = ++generation;
  clearTimeout(timer);
  const old = ws;
  ws = undefined;
  old?.close();
  status.value = dataStale.value ? 'Данные устарели · переподключение' : 'Переподключение';
  try {
    const acceptedDuringSnapshot: (Point | Decision)[] = [];
    snapshotCommands = acceptedDuringSnapshot;
    const snapshot = await getSnapshot();
    if (disposed || token !== generation) return;
    sync.reset(snapshot, acceptedDuringSnapshot);
    snapshotCommands = undefined;
    dataStale.value = false;
    connectionError.value = '';
    offset = Date.parse(snapshot.at) - Date.now();
    now.value = Date.now() + offset;
    publish();
    received = Date.now();
    const socket = openStream(sync.seq);
    ws = socket;
    socket.onopen = () => {
      if (ws !== socket) return;
      status.value = 'Подключено';
      reconnectAttempt = 0;
    };
    socket.onmessage = (e) => {
      if (ws !== socket || token !== generation) return;
      try {
        const event = parseEvent(String(e.data));
        received = Date.now();
        if (event.type === 'reset') {
          void recover();
          return;
        }
        // Old replay messages must not move the server clock backwards.
        if (Date.parse(event.at) > Date.now() + offset) offset = Date.parse(event.at) - Date.now();
        if (event.type === 'heartbeat') {
          if (event.seq > sync.seq) {
            void recover();
            return;
          }
          status.value = 'Подключено';
          return;
        }
        const action = sync.apply(event);
        if (action === 'recover') {
          void recover();
          return;
        }
        if (action === 'apply') dirty = true;
      } catch {
        connectionError.value = 'Некорректные данные сервера. Восстанавливаем состояние.';
        void recover();
      }
    };
    socket.onclose = () => {
      if (ws === socket) {
        ws = undefined;
        scheduleRecovery();
      }
    };
  } catch {
    if (token === generation && !disposed) {
      connectionError.value = 'Сервер недоступен. Повторяем подключение.';
      scheduleRecovery();
    }
  }
}
async function act(
  kind: 'decisions' | 'points',
  obj: Decision | Point,
  mode?: Point['mode'],
  attempt = new CommandAttempt(createCommandIntent(kind, obj, mode, crypto.randomUUID())),
) {
  if (!attempt.begin()) return;
  busy.value = true;
  error.value = '';
  retry.value = undefined;
  // Preserve the exact version/body even if a subsequent event replaces the object.
  const original = { ...obj };
  try {
    const result = await command(
      attempt.intent.kind,
      attempt.intent.id,
      attempt.intent.version,
      attempt.intent.key,
      attempt.intent.mode,
    );
    attempt.complete();
    if (!disposed) accept(result);
  } catch (e) {
    attempt.fail(e instanceof HttpError && e.status < 500);
    if (disposed) return;
    if (e instanceof HttpError && e.status < 500) {
      error.value = e.message;
      if (e.status === 409) accept(e.body as Decision | Point);
    } else {
      error.value = 'Ответ не получен. Команда могла выполниться. Повтор безопасен.';
      retry.value = () => act(kind, original, mode, attempt);
    }
  } finally {
    busy.value = false;
  }
}
async function initialize() {
  try {
    me.value = await getMe();
    if (!disposed) await recover();
  } catch {
    if (!disposed) {
      connectionError.value = 'Не удалось загрузить пользователя. Повторяем запрос.';
      timer = setTimeout(() => void initialize(), 3000);
    }
  }
}
onMounted(() => {
  clock = setInterval(() => {
    now.value = Date.now() + offset;
    if (dirty) publish();
    if (received && Date.now() - received > 15000 && ws) {
      dataStale.value = true;
      void recover();
    }
  }, 100);
  void initialize();
});
onUnmounted(() => {
  disposed = true;
  generation++;
  ws?.close();
  clearTimeout(timer);
  clearInterval(clock);
});
</script>
<template>
  <DispatchScreen
    :state="state"
    :me="me"
    :show-vehicle-names="showVehicleNames"
    :map-filter="mapFilter"
    :map-vehicles="mapVehicles"
    :status="status"
    :connection-error="connectionError"
    :error="error"
    :retry="Boolean(retry)"
    :busy="busy"
    :now="now"
    :stale="stale"
    :pending="pending"
    @show-vehicle-names="showVehicleNames = $event"
    @map-filter="mapFilter = $event"
    @command="act"
    @retry="retry?.()"
  />
</template>
