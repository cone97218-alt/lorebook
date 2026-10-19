<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { closeApp, lastOpenedAt, modalHost, ui } from '@/state/ui';
import { getPage, PAGES } from '@/pages/registry';
import FloatingOrb from '@/components/FloatingOrb.vue';

const isNarrow = window.matchMedia('(max-width: 640px)');
const narrowFlag = ref(isNarrow.matches);
const onMq = (e: MediaQueryListEvent) => (narrowFlag.value = e.matches);
let unsubscribeLayout: (() => void | Promise<void>) | null = null;

onMounted(async () => {
  isNarrow.addEventListener('change', onMq);
  try {
    const tt = (window as any).__TAURITAVERN__;
    const hostReady = tt?.ready ?? (window as any).__TAURITAVERN_MAIN_READY__;
    if (hostReady) await hostReady;
    const layout = (window as any).__TAURITAVERN__?.api?.layout;
    if (layout?.subscribe) {
      unsubscribeLayout = await layout.subscribe(() => {
        // Contract guarantees automatic style propagation
      });
    }
  } catch (err) {
    console.debug('[App] TauriTavern layout subscribe error:', err);
  }
});

onUnmounted(async () => {
  isNarrow.removeEventListener('change', onMq);
  if (unsubscribeLayout) {
    try {
      await unsubscribeLayout();
    } catch {
      /* ignore */
    }
    unsubscribeLayout = null;
  }
});

const current = computed(() => getPage(ui.activePage));

// 遮罩点击关闭守卫（防移动端穿透与窗内按下拖至窗外误关）
let pressedOnOverlay = false;

function onOverlayPointerDown(e: PointerEvent) {
  pressedOnOverlay = e.target === e.currentTarget;
}

function onOverlayClick(e: MouseEvent) {
  const justOpened = performance.now() - lastOpenedAt < 350;
  if (!justOpened && pressedOnOverlay && e.target === e.currentTarget) {
    closeApp();
  }
  pressedOnOverlay = false;
}

// 移动端下滑关闭手势
const dragY = ref(0);
const dragging = ref(false);
let startY = 0;
let activePointer: number | null = null;
const CLOSE_THRESHOLD = 100;

function onHandleDown(e: PointerEvent) {
  if (!narrowFlag.value) return;
  activePointer = e.pointerId;
  startY = e.clientY;
  dragging.value = true;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onHandleMove(e: PointerEvent) {
  if (!dragging.value || e.pointerId !== activePointer) return;
  dragY.value = Math.max(0, e.clientY - startY);
}

function onHandleUp(e: PointerEvent) {
  if (!dragging.value || e.pointerId !== activePointer) return;
  dragging.value = false;
  activePointer = null;
  if (dragY.value > CLOSE_THRESHOLD) {
    closeApp();
  }
  dragY.value = 0;
}

const windowStyle = computed(() => {
  if (!narrowFlag.value || dragY.value === 0) return undefined;
  return {
    transform: `translateY(${dragY.value}px)`,
    transition: dragging.value ? 'none' : undefined,
    willChange: 'transform',
  };
});
</script>

<template>
  <div class="myext-root" :data-theme="ui.theme">
    <!-- 弹窗 Teleport 挂载容器 -->
    <div ref="modalHost"></div>

    <!-- 贴边悬浮球 -->
    <FloatingOrb v-if="ui.showOrb" />

    <Transition name="myext-fade">
      <div
        v-if="ui.open"
        class="myext-overlay"
        :class="['overlay-pos-' + ui.panelPosition]"
        data-tt-mobile-surface="backdrop"
        @pointerdown="onOverlayPointerDown"
        @click="onOverlayClick"
        @keydown.esc="closeApp"
        tabindex="-1"
      >
        <div
          class="myext-window"
          :class="['pos-' + ui.panelPosition, 'h-' + ui.panelHeight]"
          data-tt-mobile-surface="fullscreen-window"
          :style="windowStyle"
          role="dialog"
          aria-modal="true"
        >
          <!-- 移动端抓手 -->
          <div
            v-if="narrowFlag"
            class="myext-grabber"
            @pointerdown="onHandleDown"
            @pointermove="onHandleMove"
            @pointerup="onHandleUp"
            @pointercancel="onHandleUp"
          >
            <span class="myext-grabber-bar"></span>
          </div>

          <!-- 顶栏与导航 (纯 FontAwesome 图标) -->
          <header class="myext-head">
            <div class="myext-head-title">
              <i class="fa-solid fa-feather-pointed"></i>
            </div>
            <nav class="myext-nav">
              <button
                v-for="p in PAGES"
                :key="p.id"
                class="myext-nav-item"
                :class="{ active: ui.activePage === p.id }"
                @click="ui.activePage = p.id"
              >
                <i :class="p.icon"></i>
              </button>
            </nav>
            <button class="myext-btn myext-close-btn" @click="closeApp">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </header>

          <!-- 内容主体 -->
          <main class="myext-body">
            <KeepAlive>
              <component :is="current.component" :key="current.id" />
            </KeepAlive>
          </main>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.myext-grabber {
  width: 100%;
  padding: 10px 0;
  display: flex;
  justify-content: center;
  touch-action: none;
  cursor: grab;
  flex-shrink: 0;
}

.myext-grabber-bar {
  width: 36px;
  height: 4px;
  background: var(--myext-line-strong);
  border-radius: 2px;
}

.myext-close-btn {
  padding: 6px 10px;
}
</style>
