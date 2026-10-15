<script setup lang="ts">
import { onMounted } from 'vue';
import { lorebookState, loadWorldBooks } from '@/state/lorebook';
import EntryList from './EntryList.vue';
import EntryEditor from './EntryEditor.vue';

onMounted(() => {
  void loadWorldBooks(true);
});
</script>

<template>
  <div class="lorebook-page">
    <Transition name="page-fade">
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

/* 移动端极速无感切换 */
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.1s ease;
}

.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
}
</style>
