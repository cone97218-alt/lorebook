<script setup lang="ts">
import { ref } from 'vue';
import { toast } from '@/st/toast';
import { appendChatInput } from '@/st/context';
import ConfirmDialog from '@/components/ConfirmDialog.vue';

const showConfirm = ref(false);

function handleQuickAction() {
  toast('触发了扩展操作', 'success');
}

function handleInsertText() {
  if (appendChatInput('【来自扩展的插入文本】')) {
    toast('已追加到聊天输入框', 'info');
  } else {
    toast('未找到输入框', 'warning');
  }
}
</script>

<template>
  <div class="page-dashboard">
    <div class="card">
      <h3>🚀 扩展工作台</h3>
      <p>这是一个完全解耦、遵循现代化工程架构规范的 SillyTavern 第三方扩展脚手架模版。</p>
      <div class="action-bar">
        <button class="myext-btn myext-btn-primary" @click="handleQuickAction">弹出 Toast</button>
        <button class="myext-btn" @click="handleInsertText">写入宿主输入框</button>
        <button class="myext-btn" @click="showConfirm = true">打开确认弹窗</button>
      </div>
    </div>

    <ConfirmDialog
      :open="showConfirm"
      title="操作确认"
      message="这是一个安全挂载在 Shadow DOM 顶层的确认框，即使在 iOS Safari 上也不会错位。"
      @confirm="showConfirm = false; toast('已确认操作', 'success')"
      @cancel="showConfirm = false"
    />
  </div>
</template>

<style scoped>
.page-dashboard {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card {
  background: var(--myext-surface);
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius);
  padding: 16px;
}

.card h3 {
  margin: 0 0 8px 0;
  font-size: 16px;
}

.card p {
  margin: 0 0 16px 0;
  font-size: 13px;
  color: var(--myext-ink-soft);
}

.action-bar {
  display: flex;
  gap: 10px;
}
</style>
