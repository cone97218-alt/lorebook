<script setup lang="ts">
import { onMounted } from 'vue';
import { lorebookState, loadWorldBooks, refreshBoundBooks } from '@/state/lorebook';
import EntryList from './EntryList.vue';
import EntryEditor from './EntryEditor.vue';

onMounted(() => {
  refreshBoundBooks();
  // 首次打开或数据为空时加载；已有世界书数据时零延迟即时呈现，避免重复请求阻塞与闪烁
  if (lorebookState.books.length === 0 || !lorebookState.bookData) {
    void loadWorldBooks(false);
  }
});
</script>

<template>
  <div class="lorebook-page">
    <KeepAlive>
      <EntryList v-if="lorebookState.viewMode === 'list'" />
      <EntryEditor v-else />
    </KeepAlive>
  </div>
</template>

<style scoped>
.lorebook-page {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--myext-bg);
}
</style>
