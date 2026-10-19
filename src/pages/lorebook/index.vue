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
    </KeepAlive>
    <EntryEditor v-if="lorebookState.viewMode === 'editor'" />

    <!-- 优雅的全局保存状态动画微提示（当用户离开详情页或触发关键保存时平滑浮现） -->
    <Transition name="save-pill-pop">
      <div
        v-if="lorebookState.saveFeedback"
        class="save-feedback-badge"
        :class="lorebookState.saveFeedback"
      >
        <i
          v-if="lorebookState.saveFeedback === 'saving'"
          class="fa-solid fa-circle-notch fa-spin badge-icon saving"
        ></i>
        <i
          v-else-if="lorebookState.saveFeedback === 'saved'"
          class="fa-solid fa-check badge-icon saved"
        ></i>
        <i
          v-else-if="lorebookState.saveFeedback === 'error'"
          class="fa-solid fa-circle-exclamation badge-icon error"
        ></i>
        <span class="badge-text">
          {{
            lorebookState.saveFeedback === 'saving'
              ? '正在保存世界书...'
              : lorebookState.saveFeedback === 'saved'
              ? '已安全存盘'
              : '保存失败'
          }}
        </span>
      </div>
    </Transition>
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

.save-feedback-badge {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 20px;
  background: var(--myext-surface);
  border: 1px solid var(--myext-line);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(8px);
  z-index: 100;
  pointer-events: none;
  font-size: 13px;
  font-weight: 500;
  color: var(--myext-ink);
  white-space: nowrap;
}

.badge-icon {
  font-size: 13px;
}

.badge-icon.saving {
  color: var(--myext-accent);
}

.badge-icon.saved {
  color: #2f9e44;
}

.badge-icon.error {
  color: #e03131;
}

.save-pill-pop-enter-active,
.save-pill-pop-leave-active {
  transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}

.save-pill-pop-enter-from,
.save-pill-pop-leave-to {
  opacity: 0;
  transform: translate(-50%, -12px) scale(0.92);
}
</style>
