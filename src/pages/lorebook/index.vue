<script setup lang="ts">
import { onMounted } from 'vue';
import { lorebookState, loadWorldBooks } from '@/state/lorebook';
import EntryList from './EntryList.vue';
import EntryEditor from './EntryEditor.vue';

onMounted(() => {
  void loadWorldBooks();
});
</script>

<template>
  <div class="lorebook-page">
    <Transition name="page-slide" mode="out-in">
      <KeepAlive>
        <component :is="lorebookState.viewMode === 'list' ? EntryList : EntryEditor" :key="lorebookState.viewMode" />
      </KeepAlive>
    </Transition>
  </div>
</template>

<style scoped>
.lorebook-page {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--myext-bg);
  position: relative;
}

.view-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 移动端页面无缝滑动转场 */
.page-slide-enter-active,
.page-slide-leave-active {
  transition: opacity 0.15s ease, transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

.page-slide-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.page-slide-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}
</style>
