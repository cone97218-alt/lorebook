<script setup lang="ts">
import { openApp } from '@/state/ui';
import { computed, reactive, ref } from 'vue';

const orbSize = 44;
const SNAP_ZONE = 40;
const POS_KEY = 'my_ext.orb.pos';

interface OrbPos {
  dock: 'left' | 'right' | 'none';
  x: number;
  y: number;
}

function loadPos(): OrbPos {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { dock: 'right', x: 0, y: Math.round(window.innerHeight * 0.6) };
}

const pos = reactive<OrbPos>(loadPos());
const dragging = ref(false);
let startX = 0;
let startY = 0;
let moved = 0;
let activePointer: number | null = null;

function savePos(): void {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}

const orbStyle = computed(() => {
  const base: Record<string, string> = {
    top: `${pos.y}px`,
    width: `${orbSize}px`,
    height: `${orbSize}px`,
    transition: dragging.value ? 'none' : 'transform 0.25s ease, opacity 0.2s ease',
  };
  if (pos.dock === 'left') {
    base.left = '0';
    base.transform = dragging.value ? 'none' : 'translateX(-20%)';
  } else if (pos.dock === 'right') {
    base.right = '0';
    base.transform = dragging.value ? 'none' : 'translateX(20%)';
  } else {
    base.left = `${pos.x}px`;
  }
  return base;
});

function onPointerDown(e: PointerEvent): void {
  activePointer = e.pointerId;
  startX = e.clientX;
  startY = e.clientY;
  moved = 0;
  dragging.value = true;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging.value || e.pointerId !== activePointer) return;
  const dx = e.clientX - startX;
  const dy = e.clientY - startY;
  moved += Math.hypot(dx, dy);

  let curX = pos.dock === 'right' ? window.innerWidth - orbSize : pos.x;
  if (pos.dock === 'left') curX = 0;

  pos.dock = 'none';
  pos.x = Math.min(Math.max(0, curX + dx), window.innerWidth - orbSize);
  pos.y = Math.min(Math.max(0, pos.y + dy), window.innerHeight - orbSize);

  startX = e.clientX;
  startY = e.clientY;
}

function onPointerUp(e: PointerEvent): void {
  if (!dragging.value || e.pointerId !== activePointer) return;
  dragging.value = false;
  activePointer = null;

  if (moved < 5) {
    openApp();
    return;
  }

  // 吸附判定
  if (pos.x <= SNAP_ZONE) {
    pos.dock = 'left';
  } else if (pos.x >= window.innerWidth - orbSize - SNAP_ZONE) {
    pos.dock = 'right';
  }
  savePos();
}
</script>

<template>
  <div
    class="myext-orb"
    :style="orbStyle"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <i class="fa-solid fa-feather-pointed"></i>
  </div>
</template>

<style scoped>
.myext-orb {
  position: fixed;
  z-index: 9999;
  border-radius: 50%;
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  cursor: pointer;
  user-select: none;
  touch-action: none;
}

.myext-orb:hover {
  transform: translateX(0) scale(1.05) !important;
}
</style>
