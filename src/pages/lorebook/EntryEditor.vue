<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted, onDeactivated, nextTick } from 'vue';
import {
  lorebookState,
  activeEntry,
  markDirty,
  handleBlurSave,
  saveImmediately,
  closeEditor,
  registerEditorFlush,
  unregisterEditorFlush,
} from '@/state/lorebook';
import type { WorldInfoEntry } from '@/api/lorebook';
import { toast } from '@/st/toast';
import { ui, onAppClose } from '@/state/ui';

const contentTextarea = ref<HTMLTextAreaElement | null>(null);

// 辅助栏折叠展开状态（关键词与符号栏默认折叠，给正文输入框留出最大视野）
const isAccessoriesExpanded = ref(ui.editorDefaultExpandAccessories);

// 插入位置与角色完整选项（对齐酒馆原生）
const positionOptions = [
  { pos: 0, role: 0, label: '角色定义前 (↑Char)' },
  { pos: 1, role: 0, label: '角色定义后 (↓Char)' },
  { pos: 5, role: 0, label: '示例消息前 (↑EM)' },
  { pos: 6, role: 0, label: '示例消息后 (↓EM)' },
  { pos: 2, role: 0, label: '作者注释前 (↑AN)' },
  { pos: 3, role: 0, label: '作者注释后 (↓AN)' },
  { pos: 4, role: 0, label: '[系统⚙] 插入深度 @D' },
  { pos: 4, role: 1, label: '[用户👤] 插入深度 @D' },
  { pos: 4, role: 2, label: '[AI🤖] 插入深度 @D' },
  { pos: 7, role: 0, label: '➡ 锚点' },
];

const selectedPosKey = computed({
  get() {
    if (!activeEntry.value) return '0_0';
    const p = activeEntry.value.position ?? 0;
    const r = activeEntry.value.role ?? 0;
    return `${p}_${r}`;
  },
  set(val: string) {
    if (!activeEntry.value) return;
    const [p, r] = val.split('_').map(Number);
    activeEntry.value.position = p;
    activeEntry.value.role = r;
    markDirty();
  },
});

// 标签临时输入
const newKeyInput = ref('');
const newSecKeyInput = ref('');
const showSecondaryKeys = ref(false);

const existingGroups = computed(() => {
  if (!lorebookState.bookData) return [];
  const set = new Set<string>();
  for (const e of Object.values(lorebookState.bookData.entries)) {
    const grp = (e.display_group || (e as any).extensions?.display_group || '').trim();
    if (grp) set.add(grp);
  }
  return Array.from(set).sort();
});

const existingInclusionGroups = computed(() => {
  if (!lorebookState.bookData) return [];
  const set = new Set<string>();
  for (const e of Object.values(lorebookState.bookData.entries)) {
    if (e.group && e.group.trim()) set.add(e.group.trim());
  }
  return Array.from(set).sort();
});

function onDisplayGroupInput() {
  if (activeEntry.value) {
    if (!activeEntry.value.extensions) activeEntry.value.extensions = {};
    (activeEntry.value.extensions as any).display_group = (activeEntry.value.display_group || '').trim();
  }
  markDirty();
}

function onInclusionGroupInput() {
  if (activeEntry.value) {
    if (!activeEntry.value.extensions) activeEntry.value.extensions = {};
    if (activeEntry.value.group && activeEntry.value.group.trim()) {
      (activeEntry.value.extensions as any).group = activeEntry.value.group.trim();
    } else {
      delete (activeEntry.value.extensions as any).group;
    }
  }
  markDirty();
}

// 本地输入解耦：击键期间 100% 原生接管，牺牲即时性以保证击键绝对无卡顿
const titleInputRef = ref<HTMLInputElement | null>(null);
let titleIdleTimer: ReturnType<typeof setTimeout> | null = null;
let contentIdleTimer: ReturnType<typeof setTimeout> | null = null;
let isComposing = false;

// 严格绑定当前正处于编辑中的条目实例与输入脏标记，坚决杜绝跨条目/跨世界书数据相互覆盖
let currentTargetEntry: WorldInfoEntry | null = null;
let isDirtyTitle = false;
let isDirtyContent = false;

function onCommentInput() {
  isDirtyTitle = true;
  if (titleIdleTimer) clearTimeout(titleIdleTimer);
  titleIdleTimer = setTimeout(() => {
    flushTitleSync();
  }, 3000);
}

function onCommentBlur() {
  flushTitleSync();
  handleBlurSave();
}

function flushTitleSync() {
  if (titleIdleTimer) {
    clearTimeout(titleIdleTimer);
    titleIdleTimer = null;
  }
  const entry = currentTargetEntry || activeEntry.value;
  if (!entry || !titleInputRef.value) return;
  const val = titleInputRef.value.value;
  if (entry.comment !== val) {
    entry.comment = val;
    markDirty();
  }
  isDirtyTitle = false;
}

// 统计信息（仅在打开词条或失焦时计算，打字期间绝不耗费任何 CPU）
const charCount = ref(0);
const estTokenCount = ref(0);

function updateStats(text: string) {
  charCount.value = text.length;
  let cjk = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x4e00 && code <= 0x9fa5) cjk++;
  }
  const nonCjk = text.length - cjk;
  estTokenCount.value = Math.ceil(cjk * 0.8 + nonCjk * 0.25);
}

function flushContentSync() {
  if (contentIdleTimer) {
    clearTimeout(contentIdleTimer);
    contentIdleTimer = null;
  }
  const entry = currentTargetEntry || activeEntry.value;
  if (!entry || !contentTextarea.value) return;
  const curVal = contentTextarea.value.value;
  if (entry.content !== curVal) {
    entry.content = curVal;
    markDirty();
  }
  isDirtyContent = false;
}

function flushAllSync() {
  flushTitleSync();
  flushContentSync();
}

function onCompositionStart() {
  isComposing = true;
}

function onCompositionEnd() {
  isComposing = false;
  // 输入法选词完成，立即触发内容变更同步并调度后台落盘
  onContentInput();
}

// 输入正文：纯原生 DOM 接管，打字期间零 JS 干扰
function onContentInput() {
  if (isComposing) return;
  isDirtyContent = true;
  // 宽松的 3 秒空闲同步（用户停笔 3 秒后才在后台同步进状态）
  if (contentIdleTimer) clearTimeout(contentIdleTimer);
  contentIdleTimer = setTimeout(() => {
    flushContentSync();
  }, 3000);
}

function syncActiveEntryToDom() {
  const entry = currentTargetEntry || activeEntry.value;
  if (entry) {
    if (titleInputRef.value) {
      titleInputRef.value.value = entry.comment || '';
    }
    if (contentTextarea.value) {
      contentTextarea.value.value = entry.content || '';
    }
    updateStats(entry.content || '');
  }
}

watch(
  [() => lorebookState.currentBook, () => activeEntry.value?.uid],
  ([newBook, newUid], [oldBook, oldUid]) => {
    if (newBook === oldBook && newUid === oldUid) return;

    // 1. 如果之前有正在编辑的条目且有未刷新的脏输入，先将变更写入旧条目
    flushAllSync();

    // 2. 将当前编辑目标指向新的条目并重置脏标记
    currentTargetEntry = activeEntry.value;
    isDirtyTitle = false;
    isDirtyContent = false;

    // 3. 将新条目的纯净内容装载至 DOM
    syncActiveEntryToDom();
    nextTick(() => {
      syncActiveEntryToDom();
    });
  },
  { immediate: true },
);

let unbindAppClose: (() => void) | null = null;

onMounted(() => {
  registerEditorFlush(flushAllSync);
  unbindAppClose = onAppClose(() => {
    flushAllSync();
  });
  currentTargetEntry = activeEntry.value;
  isDirtyTitle = false;
  isDirtyContent = false;
  syncActiveEntryToDom();
  nextTick(() => {
    syncActiveEntryToDom();
  });
});

function isBracketPair(s: string): boolean {
  const pairs = ['{}', '「」', '“”', '【】', '<>', '()', '[]', '""', "''", '《》', '『』', '（）', '〔〕', '〖〗', '｛｝'];
  if (pairs.includes(s)) return true;
  if (s.length >= 2 && s.length % 2 === 0) {
    const left = s.slice(0, s.length / 2);
    const right = s.slice(s.length / 2);
    if ((left === '{' && right === '}') || (left === '{{' && right === '}}') || (left === '<' && right === '>')) return true;
  }
  return false;
}

// 快速符号插入栏（支持符号居中与选区包裹，如点击 {} 光标置于中缝）
function insertSymbol(symbol: string) {
  const textarea = contentTextarea.value;
  if (!textarea || !activeEntry.value) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const val = textarea.value;
  const selectedText = val.substring(start, end);

  // 1. 如果包含自定义光标占位符 '|' (例如在自定义符号中设置了 "/* | */" 或 "{{|}}")
  if (symbol.includes('|')) {
    const pipeIdx = symbol.indexOf('|');
    const realText = symbol.replace('|', selectedText);
    textarea.value = val.substring(0, start) + realText + val.substring(end);
    const cursor = start + pipeIdx + (selectedText ? selectedText.length : 0);
    textarea.selectionStart = textarea.selectionEnd = cursor;
  }
  // 2. 如果存在选中文本，且为双向对称包裹符号（如 {}, 「」, “”, 【】, <> 等）
  else if (selectedText && isBracketPair(symbol)) {
    const half = symbol.length / 2;
    const leftPart = symbol.slice(0, half);
    const rightPart = symbol.slice(half);
    const wrapped = leftPart + selectedText + rightPart;
    textarea.value = val.substring(0, start) + wrapped + val.substring(end);
    textarea.selectionStart = start + half;
    textarea.selectionEnd = start + half + selectedText.length;
  }
  // 3. 无选中文本，如果是成对括号/引号：将光标直接置于符号中间（例如点击“{}”，光标在“{”和“}”之间）
  else if (isBracketPair(symbol)) {
    textarea.value = val.substring(0, start) + symbol + val.substring(end);
    const midPos = start + Math.floor(symbol.length / 2);
    textarea.selectionStart = textarea.selectionEnd = midPos;
  }
  // 4. 普通符号直接追加并定位至末尾
  else {
    textarea.value = val.substring(0, start) + symbol + val.substring(end);
    const nextPos = start + symbol.length;
    textarea.selectionStart = textarea.selectionEnd = nextPos;
  }

  isDirtyContent = true;
  flushContentSync();
  updateStats(textarea.value);
  textarea.focus();
}

// 快捷键处理 (Tab 缩进与回车保持)
function handleTextareaKeydown(e: KeyboardEvent) {
  if (isComposing || e.isComposing || (e as any).keyCode === 229) return;
  const textarea = contentTextarea.value;
  if (!textarea) return;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    void handleSaveNow();
    return;
  }

  if (e.key === 'Tab') {
    e.preventDefault();
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;

    if (e.shiftKey) {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      if (value.substring(lineStart, lineStart + 2) === '  ') {
        textarea.value = value.substring(0, lineStart) + value.substring(lineStart + 2);
        textarea.selectionStart = Math.max(lineStart, start - 2);
        textarea.selectionEnd = Math.max(lineStart, end - 2);
        onContentInput();
      }
    } else {
      textarea.value = value.substring(0, start) + '  ' + value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + 2;
      onContentInput();
    }
    return;
  }

  if (e.key === 'Enter') {
    const start = textarea.selectionStart;
    const value = textarea.value;
    const lastLineStart = value.lastIndexOf('\n', start - 1) + 1;
    const currentLine = value.substring(lastLineStart, start);
    const matchIndent = currentLine.match(/^(\s+)/);

    if (matchIndent) {
      e.preventDefault();
      const insert = '\n' + matchIndent[1];
      textarea.value = value.substring(0, start) + insert + value.substring(start);
      textarea.selectionStart = textarea.selectionEnd = start + insert.length;
      onContentInput();
    }
  }
}

async function handleSaveNow() {
  flushAllSync();
  const ok = await saveImmediately();
  if (ok) {
    toast('Saved', 'success');
  }
}

// 关键词管理
function addPrimaryKeyword() {
  const val = newKeyInput.value.trim().replace(/^[,，]+|[,，]+$/g, '');
  if (!val || !activeEntry.value) return;

  if (!Array.isArray(activeEntry.value.key)) {
    activeEntry.value.key = [];
  }

  const parts = val.split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (!activeEntry.value.key.includes(part)) {
      activeEntry.value.key.push(part);
    }
  }
  newKeyInput.value = '';
  markDirty();
}

function handleKeyInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
    e.preventDefault();
    addPrimaryKeyword();
  } else if (e.key === 'Backspace' && !newKeyInput.value && activeEntry.value?.key?.length) {
    activeEntry.value.key.pop();
    markDirty();
  }
}

function removePrimaryKeyword(index: number) {
  if (!activeEntry.value?.key) return;
  activeEntry.value.key.splice(index, 1);
  markDirty();
}

// 次要词管理
function addSecondaryKeyword() {
  const val = newSecKeyInput.value.trim().replace(/^[,，]+|[,，]+$/g, '');
  if (!val || !activeEntry.value) return;

  if (!Array.isArray(activeEntry.value.keysecondary)) {
    activeEntry.value.keysecondary = [];
  }

  const parts = val.split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (!activeEntry.value.keysecondary.includes(part)) {
      activeEntry.value.keysecondary.push(part);
    }
  }
  newSecKeyInput.value = '';
  markDirty();
}

function handleSecKeyInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
    e.preventDefault();
    addSecondaryKeyword();
  } else if (e.key === 'Backspace' && !newSecKeyInput.value && activeEntry.value?.keysecondary?.length) {
    activeEntry.value.keysecondary.pop();
    markDirty();
  }
}

function removeSecondaryKeyword(index: number) {
  if (!activeEntry.value?.keysecondary) return;
  activeEntry.value.keysecondary.splice(index, 1);
  markDirty();
}

// 详情页正文搜索与替换
const showSearch = ref(false);
const showReplace = ref(false);
const searchQuery = ref('');
const replaceQuery = ref('');
const searchMatches = ref<number[]>([]);
const currentMatchIndex = ref(-1);
const searchInputRef = ref<HTMLInputElement | null>(null);
const backdropRef = ref<HTMLDivElement | null>(null);

function toggleSearch() {
  showSearch.value = !showSearch.value;
  if (showSearch.value) {
    nextTick(() => {
      searchInputRef.value?.focus();
      if (searchQuery.value) {
        performSearch();
      }
    });
  } else {
    searchMatches.value = [];
    currentMatchIndex.value = -1;
    showReplace.value = false;
  }
}

function performSearch() {
  const text = (contentTextarea.value ? contentTextarea.value.value : activeEntry.value?.content) || '';
  const q = searchQuery.value;
  if (!q) {
    searchMatches.value = [];
    currentMatchIndex.value = -1;
    return;
  }
  const matches: number[] = [];
  const lowerText = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  let pos = 0;
  while ((pos = lowerText.indexOf(lowerQ, pos)) !== -1) {
    matches.push(pos);
    pos += lowerQ.length;
  }
  searchMatches.value = matches;
  if (matches.length > 0) {
    if (currentMatchIndex.value === -1 || currentMatchIndex.value >= matches.length) {
      currentMatchIndex.value = 0;
    }
    highlightCurrentMatch();
  } else {
    currentMatchIndex.value = -1;
  }
}

function highlightCurrentMatch() {
  if (currentMatchIndex.value < 0 || currentMatchIndex.value >= searchMatches.value.length) return;
  const start = searchMatches.value[currentMatchIndex.value];
  const end = start + searchQuery.value.length;
  const ta = contentTextarea.value;
  if (ta) {
    ta.focus();
    ta.setSelectionRange(start, end);
    const fullText = ta.value;
    const textBefore = fullText.substring(0, start);
    const lineCount = textBefore.split('\n').length;
    const approxLineHeight = 24;
    ta.scrollTop = Math.max(0, (lineCount - 2) * approxLineHeight);
    syncScroll();
  }
}

function nextMatch() {
  if (searchMatches.value.length === 0) return;
  currentMatchIndex.value = (currentMatchIndex.value + 1) % searchMatches.value.length;
  highlightCurrentMatch();
}

function prevMatch() {
  if (searchMatches.value.length === 0) return;
  currentMatchIndex.value = (currentMatchIndex.value - 1 + searchMatches.value.length) % searchMatches.value.length;
  highlightCurrentMatch();
}

function replaceCurrent() {
  if (currentMatchIndex.value < 0 || currentMatchIndex.value >= searchMatches.value.length || !activeEntry.value) return;
  const start = searchMatches.value[currentMatchIndex.value];
  const qLen = searchQuery.value.length;
  const fullText = (contentTextarea.value ? contentTextarea.value.value : activeEntry.value.content) || '';

  const newText = fullText.slice(0, start) + replaceQuery.value + fullText.slice(start + qLen);
  activeEntry.value.content = newText;
  if (currentTargetEntry) {
    currentTargetEntry.content = newText;
  }
  isDirtyContent = false;
  if (contentTextarea.value) {
    contentTextarea.value.value = newText;
  }
  markDirty();
  updateStats(newText);
  performSearch();
}

function replaceAll() {
  if (!activeEntry.value || !searchQuery.value) return;
  const fullText = (contentTextarea.value ? contentTextarea.value.value : activeEntry.value.content) || '';
  const q = searchQuery.value;
  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const count = (fullText.match(regex) || []).length;
  if (count === 0) {
    toast('未找到可替换内容', 'info');
    return;
  }
  const newText = fullText.replace(regex, replaceQuery.value);
  activeEntry.value.content = newText;
  if (currentTargetEntry) {
    currentTargetEntry.content = newText;
  }
  isDirtyContent = false;
  if (contentTextarea.value) {
    contentTextarea.value.value = newText;
  }
  markDirty();
  updateStats(newText);
  toast(`已替换 ${count} 处内容`, 'success');
  performSearch();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const highlightedHtml = computed(() => {
  if (!showSearch.value) return '';
  const text = (contentTextarea.value ? contentTextarea.value.value : activeEntry.value?.content) || '';
  const q = searchQuery.value;
  if (!q || searchMatches.value.length === 0) {
    return escapeHtml(text) + '\n';
  }

  let result = '';
  let lastIndex = 0;
  const qLen = q.length;

  for (let i = 0; i < searchMatches.value.length; i++) {
    const matchStart = searchMatches.value[i];
    const matchEnd = matchStart + qLen;

    result += escapeHtml(text.slice(lastIndex, matchStart));

    const isCurrent = i === currentMatchIndex.value;
    const matchText = escapeHtml(text.slice(matchStart, matchEnd));
    result += `<mark class="search-highlight ${isCurrent ? 'active-match' : ''}">${matchText}</mark>`;

    lastIndex = matchEnd;
  }

  result += escapeHtml(text.slice(lastIndex));
  return result + '\n';
});

function syncScroll() {
  if (showSearch.value && contentTextarea.value && backdropRef.value) {
    backdropRef.value.scrollTop = contentTextarea.value.scrollTop;
    backdropRef.value.scrollLeft = contentTextarea.value.scrollLeft;
  }
}

/**
 * 循环切换词条激活策略：绿灯 (按词触发) -> 蓝灯 (常驻注入) -> 链接 (向量化/嵌入) -> 绿灯
 */
function cycleStrategy() {
  if (!activeEntry.value) return;
  if (!activeEntry.value.constant && !activeEntry.value.vectorized) {
    // 绿灯 -> 蓝灯
    activeEntry.value.constant = true;
    activeEntry.value.vectorized = false;
  } else if (activeEntry.value.constant && !activeEntry.value.vectorized) {
    if (ui.showVectorized) {
      // 蓝灯 -> 链接
      activeEntry.value.constant = false;
      activeEntry.value.vectorized = true;
    } else {
      // 蓝灯 -> 绿灯（隐藏链接时直接循环回绿灯）
      activeEntry.value.constant = false;
      activeEntry.value.vectorized = false;
    }
  } else {
    // 链接 -> 绿灯
    activeEntry.value.constant = false;
    activeEntry.value.vectorized = false;
  }
  markDirty();
}

/**
 * 切换启用/停用总开关
 */
function toggleDisable() {
  if (!activeEntry.value) return;
  activeEntry.value.disable = !activeEntry.value.disable;
  markDirty();
}

let touchStartX = 0;
let touchStartY = 0;

function handleTouchStart(e: TouchEvent) {
  if (e.touches.length === 1) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }
}

function handleTouchCancel() {
  touchStartX = 0;
  touchStartY = 0;
}

function handleTouchEnd(e: TouchEvent) {
  if (e.changedTouches.length === 1 && touchStartX > 0) {
    const deltaX = e.changedTouches[0].clientX - touchStartX;
    const deltaY = e.changedTouches[0].clientY - touchStartY;
    const startX = touchStartX;
    touchStartX = 0;
    touchStartY = 0;

    // 排除特定组件的内部水平拖拽
    const target = e.target as HTMLElement | null;
    if (target?.tagName === 'INPUT' && (target as HTMLInputElement).type === 'range') return;
    if (target?.closest('.symbol-accessory-bar, .key-chips-flow, .drawer-range')) return;

    // 若在正文文本域中有选区文本，避免打断用户的划词操作
    if (target?.tagName === 'TEXTAREA') {
      const ta = target as HTMLTextAreaElement;
      if (ta.selectionStart !== ta.selectionEnd) return;
    }

    // 1. 边缘右滑手势（从屏幕左侧 <= 80px 开始）：极其灵敏，阈值 40px
    const isEdgeSwipe = startX <= 80 && deltaX > 40 && deltaX > Math.abs(deltaY) * 1.2;
    // 2. 屏幕内右滑（正文等区域）：滑动距离 > 65px 且明确为水平手势
    const isNormalSwipe = deltaX > 65 && deltaX > Math.abs(deltaY) * 1.5;

    if (isEdgeSwipe || isNormalSwipe) {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      handleBackClick();
    }
  }
}

function handleBackClick() {
  flushAllSync();
  closeEditor();
}

function onTextareaBlur() {
  flushContentSync();
  if (contentTextarea.value) {
    updateStats(contentTextarea.value.value);
  }
  handleBlurSave();
}

onUnmounted(() => {
  if (unbindAppClose) {
    unbindAppClose();
    unbindAppClose = null;
  }
  flushAllSync();
  unregisterEditorFlush();
  if (lorebookState.isDirty || lorebookState.isSaving) {
    void saveImmediately(false);
  }
});

onDeactivated(() => {
  flushAllSync();
  if (lorebookState.isDirty || lorebookState.isSaving) {
    void saveImmediately(false);
  }
});
</script>

<template>
  <div
    class="editor-pane"
    @touchstart.passive="handleTouchStart"
    @touchend="handleTouchEnd"
    @touchcancel="handleTouchCancel"
  >
    <div v-if="!activeEntry" class="empty-view">
      <i class="fa-solid fa-pen-ruler empty-icon"></i>
      <button class="icon-btn" @click="handleBackClick">
        <i class="fa-solid fa-chevron-left"></i>
      </button>
    </div>

    <div v-else class="editor-layout">
      <!-- 顶栏：返回与核心操作 (纯 FontAwesome 图标) -->
      <header class="editor-header">
        <button class="icon-btn" @click="handleBackClick" title="Back">
          <i class="fa-solid fa-chevron-left"></i>
        </button>

        <input
          ref="titleInputRef"
          @input="onCommentInput"
          @blur="onCommentBlur"
          type="text"
          placeholder="..."
          class="title-input"
          spellcheck="false"
          autocorrect="off"
          autocomplete="off"
        />

        <div class="header-actions">
          <!-- 1. 展开/收起辅助栏按钮 (位于标题行，默认折叠，给输入框最大空间) -->
          <button
            class="icon-btn collapse-toggle-btn"
            :class="{ active: isAccessoriesExpanded }"
            @click="isAccessoriesExpanded = !isAccessoriesExpanded"
            :title="isAccessoriesExpanded ? '收起触发词与符号栏 (最大化写作空间)' : '展开触发词与符号栏'"
          >
            <i :class="isAccessoriesExpanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'"></i>
          </button>

          <!-- 2. 搜索正文按钮 -->
          <button
            class="icon-btn"
            :class="{ active: showSearch }"
            @click="toggleSearch"
            title="搜索正文内容"
          >
            <i class="fa-solid fa-magnifying-glass"></i>
          </button>

          <!-- 3. 激活策略灯（绿灯=触发, 蓝灯=常驻, 紫灯=链接，点击切换策略） -->
          <button
            v-if="ui.editorShowStatusLight"
            class="icon-btn"
            :class="{
              'light-purple': !activeEntry.disable && activeEntry.vectorized,
              'light-blue': !activeEntry.disable && activeEntry.constant,
              'light-green': !activeEntry.disable && !activeEntry.constant && !activeEntry.vectorized,
              'light-gray': activeEntry.disable,
            }"
            @click="cycleStrategy"
            :title="activeEntry.disable ? '已停用 (策略暂时休眠)' : (activeEntry.vectorized ? '策略：链接/向量化 (点击切换为绿灯)' : (activeEntry.constant ? '策略：蓝灯常驻 (点击切换为链接)' : '策略：绿灯触发 (点击切换为蓝灯)'))"
          >
            <i class="fa-solid fa-circle"></i>
          </button>

          <!-- 4. 启停总开关 (独立电源键) -->
          <button
            class="icon-btn"
            :class="{ 'btn-power-active': !activeEntry.disable, 'btn-power-off': activeEntry.disable }"
            @click="toggleDisable"
            :title="activeEntry.disable ? '条目已停用 (点击开启)' : '条目已启用 (点击停用)'"
          >
            <i class="fa-solid fa-power-off"></i>
          </button>

          <!-- 自动保存状态指示 (纯自动保存，无需手动按键) -->
          <span
            v-if="lorebookState.isSaving"
            class="saving-indicator-icon"
            title="自动保存同步中..."
          >
            <i class="fa-solid fa-circle-notch fa-spin"></i>
          </span>
        </div>
      </header>

      <!-- 详情页正文搜索与替换栏 (移动端丝滑弹出) -->
      <Transition name="search-slide">
        <div v-if="showSearch" class="editor-search-drawer">
          <!-- 搜索第一行 -->
          <div class="search-drawer-row">
            <i class="fa-solid fa-magnifying-glass search-bar-icon"></i>
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              @input="performSearch"
              @keydown.enter.prevent="nextMatch"
              @keydown.esc="showSearch = false"
              type="text"
              placeholder="搜索正文内容..."
              class="search-bar-input"
            />
            <span class="search-counter" v-if="searchQuery">
              {{ searchMatches.length > 0 ? `${currentMatchIndex + 1}/${searchMatches.length}` : '0 处' }}
            </span>
            <button class="search-nav-btn" @click="prevMatch" :disabled="searchMatches.length === 0" title="上一个">
              <i class="fa-solid fa-chevron-up"></i>
            </button>
            <button class="search-nav-btn" @click="nextMatch" :disabled="searchMatches.length === 0" title="下一个">
              <i class="fa-solid fa-chevron-down"></i>
            </button>
            <button
              class="search-nav-btn"
              :class="{ active: showReplace }"
              @click="showReplace = !showReplace"
              title="切换替换面板"
            >
              <i class="fa-solid fa-repeat"></i>
            </button>
            <button class="search-close-btn" @click="showSearch = false" title="关闭搜索">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <!-- 替换第二行 (展开时显示) -->
          <div v-if="showReplace" class="search-drawer-row replace-row">
            <i class="fa-solid fa-arrow-right-arrow-left search-bar-icon text-muted"></i>
            <input
              v-model="replaceQuery"
              @keydown.enter.prevent="replaceCurrent"
              type="text"
              placeholder="替换为..."
              class="search-bar-input"
            />
            <button
              class="replace-action-btn"
              @click="replaceCurrent"
              :disabled="searchMatches.length === 0"
              title="替换当前选中匹配项"
            >
              替换
            </button>
            <button
              class="replace-action-btn btn-all"
              @click="replaceAll"
              :disabled="searchMatches.length === 0"
              title="替换全部匹配项"
            >
              全部
            </button>
          </div>
        </div>
      </Transition>

      <!-- 辅助区：关键词与符号栏 (默认折叠以释放最大写作空间) -->
      <Transition name="accessories-fold">
        <div v-show="isAccessoriesExpanded" class="accessories-wrapper">
          <!-- 关键词芯片栏 (纯图标引导) -->
          <section class="keywords-bar">
            <div class="key-chip-row">
              <i class="fa-solid fa-key key-prefix-icon"></i>
              <div class="key-chips-flow">
                <span
                  v-for="(k, idx) in (activeEntry.key || [])"
                  :key="idx"
                  class="key-chip"
                >
                  {{ k }}
                  <button class="chip-del" @click="removePrimaryKeyword(idx)">
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                </span>
                <input
                  v-model="newKeyInput"
                  @keydown="handleKeyInputKeydown"
                  @blur="addPrimaryKeyword"
                  type="text"
                  placeholder="..."
                  class="tag-input"
                />
              </div>
              <button
                class="icon-btn-ghost"
                :class="{ active: showSecondaryKeys }"
                @click="showSecondaryKeys = !showSecondaryKeys"
                title="Secondary Keys"
              >
                <i class="fa-solid fa-tags"></i>
              </button>
            </div>

            <!-- 次要关键词展开栏 -->
            <div v-if="showSecondaryKeys" class="sec-key-row">
              <i class="fa-solid fa-tag sec-key-icon"></i>
              <div class="key-chips-flow">
                <span
                  v-for="(k, idx) in (activeEntry.keysecondary || [])"
                  :key="idx"
                  class="key-chip chip-secondary"
                >
                  {{ k }}
                  <button class="chip-del" @click="removeSecondaryKeyword(idx)">
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                </span>
                <input
                  v-model="newSecKeyInput"
                  @keydown="handleSecKeyInputKeydown"
                  @blur="addSecondaryKeyword"
                  type="text"
                  placeholder="..."
                  class="tag-input"
                />
              </div>
            </div>
          </section>

          <!-- 手机快捷符号辅助栏 (自定义符号栏) -->
          <section v-if="ui.showSymbolBar && ui.customSymbols.length > 0" class="symbol-accessory-bar">
            <button
              v-for="sym in ui.customSymbols"
              :key="sym.id"
              class="symbol-btn"
              @click="insertSymbol(sym.insertText)"
            >
              {{ sym.label }}
            </button>
          </section>
        </div>
      </Transition>

      <!-- 核心正文编辑区（带同步背景高亮层） -->
      <main
        class="editor-main"
        :class="[`font-size-${ui.fontSize}`, `font-family-${ui.fontFamily}`, { 'search-active': showSearch }]"
      >
        <div
          v-if="showSearch"
          ref="backdropRef"
          class="content-backdrop"
          aria-hidden="true"
          v-html="highlightedHtml"
        ></div>
        <textarea
          ref="contentTextarea"
          @input="onContentInput"
          @compositionstart="onCompositionStart"
          @compositionend="onCompositionEnd"
          @scroll="syncScroll"
          @blur="onTextareaBlur"
          @keydown="handleTextareaKeydown"
          placeholder="..."
          class="content-textarea"
          spellcheck="false"
          autocorrect="off"
          autocomplete="off"
          autocapitalize="off"
        ></textarea>
      </main>

      <!-- 底栏：统计与高级抽屉开关 (根据用户设置决定是否显示) -->
      <footer v-if="ui.editorShowStats || ui.editorShowAdvancedDrawer" class="editor-footer">
        <div v-if="ui.editorShowStats" class="stats-icons">
          <span class="stat-pill" title="Characters">
            <i class="fa-solid fa-file-lines"></i>
            {{ charCount }}
          </span>
          <span class="stat-pill" title="Tokens">
            <i class="fa-solid fa-bolt"></i>
            ~{{ estTokenCount }}
          </span>
          <span class="stat-pill text-muted">
            #{{ activeEntry.uid }}
          </span>
        </div>
        <div v-else></div>

        <button
          v-if="ui.editorShowAdvancedDrawer"
          class="icon-btn"
          :class="{ active: lorebookState.showAdvanced }"
          @click="lorebookState.showAdvanced = !lorebookState.showAdvanced"
          title="Advanced Parameters"
        >
          <i class="fa-solid fa-sliders"></i>
        </button>
      </footer>

      <!-- 高级参数抽屉 (极简滑出卡片) -->
      <Transition name="drawer-slide">
        <div v-if="lorebookState.showAdvanced" class="advanced-drawer">
          <div class="drawer-header">
            <span class="drawer-title">高级策略设置</span>
            <button class="icon-btn-ghost" @click="lorebookState.showAdvanced = false">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div class="drawer-body">
            <!-- 插入位置：根据 ui.editorShowPosition 显示 -->
            <div v-if="ui.editorShowPosition" class="drawer-field-row">
              <span class="drawer-field-label">插入位置</span>
              <select
                v-model="selectedPosKey"
                class="drawer-select"
              >
                <option
                  v-for="opt in positionOptions"
                  :key="`${opt.pos}_${opt.role}`"
                  :value="`${opt.pos}_${opt.role}`"
                >
                  {{ opt.label }}
                </option>
              </select>
            </div>

            <!-- 插入深度：仅在 position === 4 深度插入且 ui.editorShowPosition 开启时展示 -->
            <div v-if="ui.editorShowPosition && activeEntry.position === 4" class="drawer-field-row">
              <span class="drawer-field-label">插入深度</span>
              <input
                v-model.number="activeEntry.depth"
                @input="markDirty"
                type="number"
                min="0"
                max="100"
                class="drawer-input"
                placeholder="0-100"
              />
            </div>

            <!-- 顺序：根据 ui.editorShowOrder 显示 -->
            <div v-if="ui.editorShowOrder" class="drawer-field-row">
              <span class="drawer-field-label">顺序</span>
              <input
                v-model.number="activeEntry.order"
                @input="markDirty"
                type="number"
                class="drawer-input"
              />
            </div>

            <!-- 概率：根据 ui.editorShowProbability 显示 -->
            <div v-if="ui.editorShowProbability" class="drawer-field-row">
              <span class="drawer-field-label">概率</span>
              <div class="drawer-field-input-box">
                <input
                  v-model.number="activeEntry.probability"
                  @input="markDirty"
                  type="number"
                  min="1"
                  max="100"
                  class="drawer-input"
                  placeholder="1-100"
                />
                <span class="drawer-input-unit">%</span>
              </div>
            </div>

            <!-- 次要词逻辑：根据 ui.editorShowSelectiveLogic 显示 -->
            <div v-if="ui.editorShowSelectiveLogic" class="drawer-field-row">
              <span class="drawer-field-label">次要词逻辑</span>
              <select
                v-model.number="activeEntry.selectiveLogic"
                @change="markDirty"
                class="drawer-select"
              >
                <option :value="0">包含任意 (AND ANY)</option>
                <option :value="3">同时包含全部 (AND ALL)</option>
                <option :value="2">排除任意 (NOT ANY)</option>
                <option :value="1">排除全部 (NOT ALL)</option>
              </select>
            </div>

            <!-- 扫描深度：根据 ui.editorShowScanDepth 显示 -->
            <div v-if="ui.editorShowScanDepth" class="drawer-field-row">
              <span class="drawer-field-label">扫描深度</span>
              <input
                v-model.number="activeEntry.scanDepth"
                @input="markDirty"
                type="number"
                min="0"
                class="drawer-input"
                placeholder="默认全局"
              />
            </div>

            <!-- 所属分组 (纯 UI 视觉分类展示，不影响任何底层互斥与激活逻辑) -->
            <div class="drawer-field-row">
              <span class="drawer-field-label">所属分组</span>
              <input
                v-model="activeEntry.display_group"
                @input="onDisplayGroupInput"
                type="text"
                class="drawer-input"
                placeholder="未分组 (纯 UI 归类展示，不影响激活)"
                list="existing-groups-datalist"
              />
              <datalist id="existing-groups-datalist">
                <option v-for="g in existingGroups" :key="g" :value="g" />
              </datalist>
            </div>

            <!-- 原生互斥组：根据 ui.editorShowInclusionGroup 显示 -->
            <div v-if="ui.editorShowInclusionGroup" class="drawer-field-row">
              <span class="drawer-field-label">互斥组</span>
              <input
                v-model="activeEntry.group"
                @input="onInclusionGroupInput"
                type="text"
                class="drawer-input"
                placeholder="留空不互斥 (同组每次仅激活一条)"
                list="existing-inclusion-groups-datalist"
              />
              <datalist id="existing-inclusion-groups-datalist">
                <option v-for="g in existingInclusionGroups" :key="g" :value="g" />
              </datalist>
            </div>

            <!-- 自动化 ID：根据 ui.editorShowAutomation 显示 -->
            <div v-if="ui.editorShowAutomation" class="drawer-field-row">
              <span class="drawer-field-label">自动化 ID</span>
              <input
                v-model="activeEntry.automationId"
                @input="markDirty"
                type="text"
                class="drawer-input"
                placeholder="自动化 ID"
              />
            </div>

            <!-- 高级开关：根据 ui.editorShowRecursion 显示 -->
            <div v-if="ui.editorShowRecursion" class="drawer-toggles-grid">
              <button
                class="toggle-chip-label"
                :class="{ active: activeEntry.preventRecursion }"
                @click="activeEntry.preventRecursion = !activeEntry.preventRecursion; markDirty()"
                title="阻止递归：当前条目激活后，其内容不会再去递归触发其他世界书条目"
              >
                <i class="fa-solid fa-shield-halved"></i>
                <span>阻止递归</span>
              </button>

              <button
                class="toggle-chip-label"
                :class="{ active: activeEntry.excludeRecursion }"
                @click="activeEntry.excludeRecursion = !activeEntry.excludeRecursion; markDirty()"
                title="排除递归：其他条目的内容不能触发当前条目，当前条目只能由用户/AI聊天消息触发"
              >
                <i class="fa-solid fa-ban"></i>
                <span>排除递归</span>
              </button>

              <button
                class="toggle-chip-label"
                :class="{ active: activeEntry.caseSensitive }"
                @click="activeEntry.caseSensitive = !activeEntry.caseSensitive; markDirty()"
                title="区分大小写：关键词大小写严格敏感匹配"
              >
                <i class="fa-solid fa-font"></i>
                <span>区分大小写</span>
              </button>

              <button
                class="toggle-chip-label"
                :class="{ active: activeEntry.matchWholeWords }"
                @click="activeEntry.matchWholeWords = !activeEntry.matchWholeWords; markDirty()"
                title="全词匹配：关键词需独立成词，避免词根误触"
              >
                <i class="fa-solid fa-quote-right"></i>
                <span>全词匹配</span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.editor-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--myext-bg);
  position: relative;
  overflow: hidden;
}

.empty-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--myext-ink-muted);
  gap: 16px;
}

.empty-icon {
  font-size: 40px;
}

.editor-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  position: relative;
  overflow: hidden;
}

/* 顶栏 */
.editor-header {
  padding: 8px 12px;
  background: var(--myext-surface);
  border-bottom: 1px solid var(--myext-line);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.title-input {
  flex: 1;
  min-width: 0;
  height: 38px;
  padding: 0 10px;
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius-sm);
  background: var(--myext-surface-2);
  color: var(--myext-ink);
  font-size: 14px;
  font-weight: 600;
  outline: none;
}

.title-input:focus {
  border-color: var(--myext-accent);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* 纯图标通用按钮 */
.icon-btn {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius-sm);
  background: var(--myext-surface-2);
  color: var(--myext-ink-soft);
  cursor: pointer;
  transition: all 0.15s;
  font-size: 14px;
  flex-shrink: 0;
}

.icon-btn:hover,
.icon-btn:active {
  background: var(--myext-surface);
  border-color: var(--myext-accent);
  color: var(--myext-accent);
}

.icon-btn.active {
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  border-color: var(--myext-accent);
}

.btn-warning-active {
  background: rgba(250, 176, 5, 0.2);
  color: #f59f00;
  border-color: #f59f00;
}

.btn-accent {
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  border-color: var(--myext-accent);
}

.saving-indicator-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: var(--myext-accent);
  font-size: 14px;
}

.icon-btn-ghost {
  background: none;
  border: none;
  color: var(--myext-ink-soft);
  padding: 6px;
  cursor: pointer;
  font-size: 14px;
}

.icon-btn-ghost.active {
  color: var(--myext-accent);
}

/* 关键词芯片栏 */
.keywords-bar {
  padding: 8px 12px;
  background: var(--myext-surface);
  border-bottom: 1px solid var(--myext-line);
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.key-chip-row,
.sec-key-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.key-prefix-icon,
.sec-key-icon {
  font-size: 13px;
  color: var(--myext-accent);
  flex-shrink: 0;
}

.sec-key-icon {
  color: var(--myext-ink-muted);
}

.key-chips-flow {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-height: 32px;
}

.key-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: rgba(34, 139, 230, 0.12);
  color: var(--myext-accent);
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.chip-secondary {
  background: rgba(134, 142, 150, 0.15);
  color: var(--myext-ink-soft);
}

.chip-del {
  background: none;
  border: none;
  color: inherit;
  font-size: 10px;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
}

.tag-input {
  flex: 1;
  min-width: 60px;
  border: none;
  background: transparent;
  color: var(--myext-ink);
  font-size: 12px;
  outline: none;
}

/* 手机快捷符号辅助栏 */
.symbol-accessory-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--myext-surface-2);
  border-bottom: 1px solid var(--myext-line);
  overflow-x: auto;
  flex-shrink: 0;
  -webkit-overflow-scrolling: touch;
}

.symbol-btn {
  height: 28px;
  padding: 0 10px;
  background: var(--myext-surface);
  border: 1px solid var(--myext-line);
  border-radius: 4px;
  color: var(--myext-ink);
  font-size: 12px;
  font-family: var(--myext-font-mono);
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.1s;
}

.symbol-btn:active {
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  border-color: var(--myext-accent);
}

/* 核心编辑正文区（输入与同步背景高亮） */
.editor-main {
  flex: 1;
  min-height: 0;
  position: relative;
  background: var(--myext-bg);
  overflow: hidden;
  contain: strict;
}

.content-backdrop,
.content-textarea {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  padding: 14px 16px;
  padding-bottom: max(calc(var(--tt-viewport-bottom-inset, var(--tt-inset-bottom, 0px)) + 28px), 28px);
  scroll-padding-bottom: max(calc(var(--tt-viewport-bottom-inset, var(--tt-inset-bottom, 0px)) + 28px), 28px);
  overscroll-behavior-y: contain;
  border: none;
  outline: none;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  tab-size: 2;
  box-sizing: border-box;
  margin: 0;
  font-family: inherit;
}

.content-backdrop {
  overflow: hidden;
  pointer-events: none;
  color: transparent;
  background: transparent;
  z-index: 1;
}

.content-textarea {
  background: var(--myext-bg);
  color: var(--myext-ink);
  resize: none;
  z-index: 2;
  -webkit-overflow-scrolling: touch;
}

/* 仅在搜索高亮激活时透明，以便露出 backdrop 高亮层 */
.search-active .content-textarea {
  background: transparent;
}

/* 高亮标注样式 (柔和莫兰迪黄底色与当前选中的柔绿高亮) */
:deep(.search-highlight) {
  background-color: rgba(220, 190, 110, 0.4);
  color: transparent;
  border-radius: 2px;
  padding: 1px 0;
}

:deep(.search-highlight.active-match) {
  background-color: rgba(110, 150, 129, 0.7);
  outline: 1px solid rgba(110, 150, 129, 0.9);
  border-radius: 2px;
}

.font-size-sm .content-textarea, .font-size-sm .content-backdrop { font-size: 13px; }
.font-size-md .content-textarea, .font-size-md .content-backdrop { font-size: 15px; }
.font-size-lg .content-textarea, .font-size-lg .content-backdrop { font-size: 17px; }
.font-size-xl .content-textarea, .font-size-xl .content-backdrop { font-size: 19px; }
.font-family-mono .content-textarea, .font-family-mono .content-backdrop { font-family: var(--myext-font-mono) !important; }
.font-family-sans .content-textarea, .font-family-sans .content-backdrop { font-family: var(--myext-font-sans) !important; }

/* 底栏 */
.editor-footer {
  padding: 6px 12px;
  background: var(--myext-surface);
  border-top: 1px solid var(--myext-line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.stats-icons {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--myext-ink-soft);
  font-family: var(--myext-font-mono);
}

.stat-pill {
  display: flex;
  align-items: center;
  gap: 4px;
}

.stat-pill i {
  font-size: 11px;
  color: var(--myext-ink-muted);
}

/* 高级参数底部抽屉 */
.advanced-drawer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--myext-surface);
  border-top: 1px solid var(--myext-line);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.2);
  z-index: 15;
  padding: 12px 16px 20px;
  max-height: 60%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--myext-line);
  padding-bottom: 8px;
}

.drawer-icon {
  font-size: 14px;
  color: var(--myext-accent);
}

/* 辅助区折叠容器 */
.accessories-wrapper {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.accessories-fold-enter-active,
.accessories-fold-leave-active {
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  max-height: 250px;
}

.accessories-fold-enter-from,
.accessories-fold-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-8px);
}

.drawer-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.drawer-field-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
}

.drawer-field-label {
  width: 72px;
  min-width: 72px;
  font-size: 13px;
  color: var(--myext-ink-soft);
  flex-shrink: 0;
  text-align: right;
  font-weight: 500;
}

.drawer-field-input-box {
  flex: 1 1 0%;
  min-width: 0;
  display: flex;
  align-items: center;
  position: relative;
  box-sizing: border-box;
}

.drawer-field-input-box .drawer-input {
  width: 100%;
  padding-right: 28px;
  box-sizing: border-box;
}

.drawer-input-unit {
  position: absolute;
  right: 12px;
  font-size: 12px;
  color: var(--myext-ink-muted);
  pointer-events: none;
}

.setting-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.setting-icon-label {
  width: 44px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--myext-ink-soft);
  flex-shrink: 0;
}

.setting-val {
  font-size: 11px;
  font-family: var(--myext-font-mono);
  color: var(--myext-ink-muted);
}

.drawer-select,
.drawer-input {
  flex: 1 1 0%;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius-sm);
  background: var(--myext-surface-2);
  color: var(--myext-ink);
  font-size: 13px;
  outline: none;
}

.drawer-range {
  flex: 1 1 0%;
  min-width: 0;
  box-sizing: border-box;
  height: 36px;
  accent-color: var(--myext-accent);
}

/* 状态指示灯（柔和莫兰迪色系，无刺眼高光与光晕） */
.light-blue {
  color: #6b8ca8 !important;
}

.light-green {
  color: #6e9681 !important;
}

.light-purple {
  color: #95819e !important;
}

.light-gray {
  color: #828a93 !important;
  opacity: 0.5;
}

/* 启停总开关按钮样式 */
.btn-power-active {
  color: #6e9681 !important;
}

.btn-power-off {
  color: #828a93 !important;
  opacity: 0.5;
}

/* 详情页正文搜索与替换栏 */
.editor-search-drawer {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px;
  background: var(--myext-surface-2);
  border-bottom: 1px solid var(--myext-line);
  flex-shrink: 0;
  z-index: 10;
}

.search-drawer-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-bar-icon {
  font-size: 13px;
  color: var(--myext-accent);
  flex-shrink: 0;
}

.search-bar-input {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius-sm);
  background: var(--myext-surface);
  color: var(--myext-ink);
  font-size: 13px;
  outline: none;
}

.search-bar-input:focus {
  border-color: var(--myext-accent);
}

.search-counter {
  font-size: 11px;
  color: var(--myext-ink-muted);
  font-family: var(--myext-font-mono);
  white-space: nowrap;
}

.search-nav-btn,
.search-close-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--myext-line);
  border-radius: 4px;
  background: var(--myext-surface);
  color: var(--myext-ink-soft);
  cursor: pointer;
  font-size: 11px;
  flex-shrink: 0;
  transition: all 0.15s;
}

.search-nav-btn.active {
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  border-color: var(--myext-accent);
}

.search-nav-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.search-nav-btn:not(:disabled):active,
.search-close-btn:active {
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
}

.replace-row {
  padding-top: 4px;
  border-top: 1px dashed var(--myext-line);
}

.replace-action-btn {
  height: 28px;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 4px;
  border: 1px solid var(--myext-line);
  background: var(--myext-surface);
  color: var(--myext-ink);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.15s;
}

.replace-action-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.replace-action-btn:not(:disabled):active {
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  border-color: var(--myext-accent);
}

.replace-action-btn.btn-all {
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  border-color: var(--myext-accent);
}

.search-slide-enter-active,
.search-slide-leave-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.search-slide-enter-from,
.search-slide-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-8px);
}

.drawer-toggles-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding-top: 10px;
  border-top: 1px dashed var(--myext-line);
}

.toggle-chip-label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 38px;
  padding: 0 10px;
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius-sm);
  background: var(--myext-surface-2);
  color: var(--myext-ink-soft);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}

.toggle-chip-label i {
  font-size: 13px;
}

.toggle-chip-label.active {
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  border-color: var(--myext-accent);
  font-weight: 600;
}

/* 抽屉过渡动画 */
.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
}

.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

@media (max-width: 480px) {
  .advanced-drawer {
    padding: 10px 12px 18px;
    box-sizing: border-box;
  }
  .drawer-field-row {
    gap: 8px;
  }
  .drawer-field-label {
    width: 64px;
    min-width: 64px;
    font-size: 12px;
  }
}

@media (max-width: 640px) {
  .title-input,
  .content-textarea {
    font-size: 16px !important;
  }
}
</style>
