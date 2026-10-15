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
