<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import type { Vehicle, Point } from '../helpers/model';
import { isStale } from '../helpers/model';
const props = defineProps<{
  vehicles: Vehicle[];
  points: Point[];
  now: number;
  showVehicleNames: boolean;
}>();
const canvas = ref<HTMLCanvasElement>();
let frame = 0;
onMounted(() => {
  const body = new Path2D(
    'M -11 -7 L 2 -7 L 0 -1 L -8 -1 Z M -9 0 H 3 V -6 H 7 L 10 -2 V 3 H -9 Z',
  );
  const directionArrow = new Path2D('M 14 0 H 29 M 24 -4 L 29 0 L 24 4');
  const cabWindow = new Path2D('M 4 -5 H 6.5 L 8.5 -2 H 4 Z');
  const wheels = new Path2D();
  wheels.arc(-6, 3, 2.7, 0, Math.PI * 2);
  wheels.moveTo(9.2, 3);
  wheels.arc(6.5, 3, 2.7, 0, Math.PI * 2);
  const draw = () => {
    const c = canvas.value;
    if (!c) return;
    const width = c.clientWidth,
      height = c.clientHeight,
      dpr = devicePixelRatio;
    if (c.width !== width * dpr || c.height !== height * dpr) {
      c.width = width * dpr;
      c.height = height * dpr;
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const x = (v: number) => 20 + (v / 6000) * (width - 40),
      y = (v: number) => 20 + (v / 4000) * (height - 40);
    ctx.strokeStyle = '#1c343a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 6000; i += 500) {
      ctx.beginPath();
      ctx.moveTo(x(i), 20);
      ctx.lineTo(x(i), height - 20);
      ctx.stroke();
    }
    for (let i = 0; i <= 4000; i += 500) {
      ctx.beginPath();
      ctx.moveTo(20, y(i));
      ctx.lineTo(width - 20, y(i));
      ctx.stroke();
    }
    for (const p of props.points) {
      ctx.beginPath();
      ctx.arc(x(p.x_m), y(p.y_m), 23, 0, Math.PI * 2);
      ctx.fillStyle = p.mode === 'auto' ? '#173b38' : '#493c27';
      ctx.fill();
      ctx.strokeStyle = p.mode === 'auto' ? '#4f8c7a' : '#bf9754';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    const colors = {
      moving_empty: '#6bdcc2',
      moving_loaded: '#66a8ff',
      queued: '#edc671',
      service: '#bc98ed',
      idle: '#9eaeb4',
      offline: '#627479',
    };
    for (const v of props.vehicles) {
      const color = isStale(v, props.now) ? '#68777a' : colors[v.state];
      ctx.save();
      ctx.translate(x(v.x_m), y(v.y_m));
      // Keep the side view upright; mirror the cab when travelling left.
      ctx.scale(Math.cos((v.heading_deg * Math.PI) / 180) < 0 ? -0.85 : 0.85, 0.85);
      ctx.fillStyle = color;
      ctx.fill(body);
      ctx.fillStyle = '#11272b';
      ctx.fill(cabWindow);
      ctx.fill(wheels);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.stroke(wheels);
      ctx.restore();
      if (v.speed_kmh > 0 && (v.state === 'moving_empty' || v.state === 'moving_loaded')) {
        const heading = (v.heading_deg * Math.PI) / 180;
        const screenHeading = Math.atan2(
          (Math.sin(heading) * (height - 40)) / 4000,
          (Math.cos(heading) * (width - 40)) / 6000,
        );
        ctx.save();
        ctx.translate(x(v.x_m), y(v.y_m));
        ctx.rotate(screenHeading);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke(directionArrow);
        ctx.restore();
      }
    }
    if (props.showVehicleNames) {
      ctx.save();
      ctx.font = '500 11px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.strokeStyle = '#11272b';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      for (const v of props.vehicles) {
        const labelX = x(v.x_m);
        const labelY = y(v.y_m) + 8;
        ctx.fillStyle = isStale(v, props.now) ? '#8b9b9e' : '#d9f5ea';
        ctx.strokeText(v.name, labelX, labelY);
        ctx.fillText(v.name, labelX, labelY);
      }
      ctx.restore();
    }
    // Draw point labels last so nearby trucks cannot obscure the destination names.
    ctx.save();
    ctx.font = '600 12px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of props.points) {
      const px = x(p.x_m);
      const py = y(p.y_m) - 40;
      const labelWidth = ctx.measureText(p.name).width + 24;
      ctx.beginPath();
      ctx.roundRect(px - labelWidth / 2, py - 13, labelWidth, 26, 5);
      ctx.fillStyle = '#203a40';
      ctx.fill();
      ctx.strokeStyle = p.mode === 'auto' ? '#4f8c7a' : '#bf9754';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#e4eeed';
      ctx.fillText(p.name, px, py);
    }
    ctx.restore();
    if (import.meta.env.VITE_PERF === '1') {
      const metrics = window as unknown as {
        __canvasPerf?: { frames: number; last: number; samples: number[] };
      };
      const t = performance.now();
      const record = (metrics.__canvasPerf ??= { frames: 0, last: t, samples: [] });
      record.frames++;
      if (t - record.last >= 1000) {
        record.samples.push((record.frames * 1000) / (t - record.last));
        record.frames = 0;
        record.last = t;
        if (record.samples.length > 43200) record.samples.shift();
      }
    }
    frame = requestAnimationFrame(draw);
  };
  draw();
});
onUnmounted(() => cancelAnimationFrame(frame));
</script>
<template><canvas ref="canvas" aria-label="Схема площадки: пункты и машины" role="img" /></template>
<style scoped>
canvas {
  width: 100%;
  height: 100%;
  position: absolute;
  inset: 0;
  display: block;
  background: #11272b;
  border-radius: 6px;
}
</style>
