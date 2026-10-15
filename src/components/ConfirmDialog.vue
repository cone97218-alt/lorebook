<script setup lang="ts">
import ModalMask from './ModalMask.vue';

defineProps<{
  open?: boolean;
  title?: string;
  message?: string;
}>();

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();
</script>

<template>
  <ModalMask :open="open" @close="emit('cancel')">
    <div class="confirm-box">
      <div class="confirm-head">
        <div class="head-lead">
          <i class="fa-solid fa-book-bookmark head-icon"></i>
          <span class="head-title">{{ title || '世界书' }}</span>
        </div>
        <button class="icon-btn-ghost" @click="emit('cancel')">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <p class="confirm-message">{{ message }}</p>
      <div class="confirm-actions">
        <button class="icon-btn" @click="emit('cancel')" title="取消">
          <i class="fa-solid fa-xmark"></i>
        </button>
        <button class="icon-btn btn-danger" @click="emit('confirm')" title="确认">
          <i class="fa-solid fa-check"></i>
        </button>
      </div>
    </div>
  </ModalMask>
</template>

<style scoped>
.confirm-box {
  width: 100%;
  max-width: 320px;
  background: var(--myext-surface);
  border-radius: var(--myext-radius);
  border: 1px solid var(--myext-line-strong);
  padding: 14px;
  box-shadow: var(--myext-shadow);
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: auto;
}

.confirm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--myext-line);
  padding-bottom: 8px;
}

.head-lead {
  display: flex;
  align-items: center;
  gap: 8px;
}

.head-icon {
  font-size: 14px;
  color: var(--myext-accent);
}

.head-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--myext-ink);
}

.icon-btn-ghost {
  background: none;
  border: none;
  color: var(--myext-ink-soft);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.warn-icon {
  font-size: 20px;
  color: #fa5252;
}

.confirm-message {
  margin: 0;
  font-size: 13px;
  color: var(--myext-ink);
  line-height: 1.5;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.icon-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius-sm);
  background: var(--myext-surface-2);
  color: var(--myext-ink-soft);
  cursor: pointer;
  font-size: 14px;
}

.btn-danger {
  background: #fa5252;
  color: #fff;
  border-color: #fa5252;
}
</style>
