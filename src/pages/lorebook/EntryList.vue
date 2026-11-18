<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onBeforeUnmount, nextTick } from 'vue';
import {
  lorebookState,
  filteredEntries,
  filteredBooks,
  entryGroups,
  bookStats,
  selectWorldBook,
  openEntry,
  addNewEntry,
  duplicateEntry,
  removeEntry,
  toggleEntryDisable,
  cycleEntryStrategy,
  setEntryStrategy,
  loadWorldBooks,
  createBook,
  deleteCurrentBook,
  renameCurrentBook,
  toggleGroupEnabled,
  toggleGroupFold,
  reorderGroups,
  moveGroupOrder,
  toggleCharacterPrimaryBind,
  toggleCharacterAuxBind,
  toggleChatBind,
  toggleGlobalBind,
  refreshBoundBooks,
  takeSnapshot,
  applyBookSnapshot,
  removeBookSnapshot,
  overwriteBookSnapshot,
  getSnapshotDiff,
  toggleBatchMode,
  toggleSelectUid,
  selectRangeTo,
  invertSelection,
  selectAll,
  deselectAll,
  batchEnable,
  batchDisable,
  batchSetStrategy,
  batchAdjustOrder,
  batchAdjustPositionAndDepth,
  batchTransferEntries,
  batchGlobalSearchReplace,
  toggleSelectGroup,
  estimateTextTokens,
  getActivationEntryStats,
  batchDelete,
  batchSetGroup,
  batchExportJson,
  batchImportJson,
  batchDeleteBooks,
  batchImportBooks,
  switchBookScope,
  checkLastActivation,
  type WorldBookSnapshot,
  type SnapshotDiff,
  type WorldBookTab,
  type BookScopeFilter,
  type EntryGroup,
} from '@/state/lorebook';
import {
  ui,
  BATCH_ACTION_META,
  toggleBatchPinnedAction,
  resetBatchPinnedActions,
  type BatchActionId,
} from '@/state/ui';
import { toast } from '@/st/toast';
import { historyList, undoAction, clearHistory } from '@/state/history';

const showNewBookModal = ref(false);
const newBookName = ref('');
const showRenameBookModal = ref(false);
const renameBookName = ref('');
const showDeleteBookModal = ref(false);
const showBookToolsMenu = ref(false);
const showBindMenu = ref(false);
const isBindingBusy = ref(false);
const entryToDelete = ref<number | null>(null);

const showBatchDeleteModal = ref(false);
const showBatchGroupModal = ref(false);
const batchGroupName = ref('');
const showBatchOrderModal = ref(false);
const batchOrderScope = ref<'selected' | 'from_start'>('selected');
const batchOrderStartUid = ref<number | null>(null);
const batchOrderStartVal = ref<number>(100);
const batchOrderStep = ref<number>(1);
const showBatchPosModal = ref(false);
const batchPosKey = ref('4_0');
const batchDepthMode = ref<'fixed' | 'increment' | 'keep'>('fixed');
const batchDepthStart = ref<number>(4);
const batchDepthStep = ref<number>(1);
const showBatchTransferModal = ref(false);
const batchTransferTargetBook = ref('');
const batchTransferMode = ref<'copy' | 'move'>('copy');
const batchTransferGroupMode = ref<'keep' | 'custom'>('keep');
const batchTransferCustomGroup = ref('');
const isBatchTransferring = ref(false);
const showGlobalReplaceModal = ref(false);
const globalReplaceScope = ref<'all' | 'selected'>('all');
const globalSearchText = ref('');
const globalReplaceText = ref('');
const globalReplaceCaseSensitive = ref(false);
const globalReplaceInComment = ref(true);
const globalReplaceInKeys = ref(true);
const globalReplaceInContent = ref(true);
const tokenStatMode = ref<'enabled' | 'activated'>('enabled');
const showBatchMoreMenu = ref(false);
const isEditingBatchPins = ref(false);
const showImportModal = ref(false);
const importJsonText = ref('');
const showCreateSnapshotModal = ref(false);
const showOverwriteSnapshotModal = ref(false);
const snapshotToOverwrite = ref<string | null>(null);
const showDiffModal = ref(false);
const activeDiffSnapshot = ref<WorldBookSnapshot | null>(null);
const activeSnapshotDiff = computed<SnapshotDiff | null>(() => {
  if (!activeDiffSnapshot.value) return null;
  return getSnapshotDiff(activeDiffSnapshot.value);
});
const newSnapshotName = ref('');
const fileInputRef = ref<HTMLInputElement | null>(null);

// 历史操作日志弹窗
const showHistoryModal = ref(false);

// 批量管理世界书 (删除与导入)
const showBatchBookModal = ref(false);
const batchBookTab = ref<'delete' | 'import'>('delete');
const selectedBookNames = ref<string[]>([]);
const batchImportFilesList = ref<File[]>([]);
const batchFileInput = ref<HTMLInputElement | null>(null);

// 记忆滚动位置
const entriesScrollArea = ref<HTMLElement | null>(null);
let scrollThrottleTimer: ReturnType<typeof setTimeout> | null = null;

function onScroll(e: Event) {
  const el = e.target as HTMLElement;
  if (scrollThrottleTimer) return;
  scrollThrottleTimer = setTimeout(() => {
    lorebookState.savedScrollTop = el.scrollTop;
    scrollThrottleTimer = null;
  }, 150);
}

function restoreScroll() {
  nextTick(() => {
    if (entriesScrollArea.value && lorebookState.savedScrollTop > 0) {
      entriesScrollArea.value.scrollTop = lorebookState.savedScrollTop;
    }
  });
}

onMounted(() => {
  restoreScroll();
});

onActivated(() => {
  restoreScroll();
});

onBeforeUnmount(() => {
  if (scrollThrottleTimer) {
    clearTimeout(scrollThrottleTimer);
    scrollThrottleTimer = null;
  }
  if (entriesScrollArea.value) {
    lorebookState.savedScrollTop = entriesScrollArea.value.scrollTop;
  }
});

// 策略下拉获取与切换
function getEntryStrategy(entry: { constant?: boolean; vectorized?: boolean }): 'green' | 'blue' | 'purple' {
  if (entry.vectorized) return 'purple';
  if (entry.constant) return 'blue';
  return 'green';
}

function onStrategySelect(uid: number, event: Event) {
  const target = event.target as HTMLSelectElement;
  setEntryStrategy(uid, target.value as 'green' | 'blue' | 'purple');
}

// 插入深度与位置小标签映射 (区分 D系统 / D用户 / Dai)
function getDepthRoleLabel(entry: { role?: number }): string {
  if (entry.role === 1) return 'D用户';
  if (entry.role === 2) return 'Dai';
  return 'D系统';
}

function getDepthRoleClass(entry: { role?: number }): string {
  if (entry.role === 1) return 'tag-depth-user';
  if (entry.role === 2) return 'tag-depth-ai';
  return 'tag-depth-sys';
}

function getPositionLabel(entry: { position?: number }): string {
  switch (entry.position) {
    case 0:
      return '角色前';
    case 1:
      return '角色后';
    case 2:
      return '作者注释前';
    case 3:
      return '作者注释后';
    case 5:
      return '示例前';
    case 6:
      return '示例后';
    case 7:
      return '锚点';
    default:
      return '';
  }
}

// 触摸左右滑动切换视图
let touchStartX = 0;
let touchStartY = 0;

function handleTouchStart(e: TouchEvent) {
  if (e.touches.length === 1) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }
}

function handleTouchEnd(e: TouchEvent) {
  if (e.changedTouches.length === 1) {
    const deltaX = e.changedTouches[0].clientX - touchStartX;
    const deltaY = e.changedTouches[0].clientY - touchStartY;
    // 水平手势幅度需大于 50px 且明显大于垂直移动
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          '.book-scope-bar, .batch-actions-scroll, .batch-floating-bar, .batch-more-popover, .view-tabs-bar, .modal-box, .group-drag-handle, .group-sort-btns, .book-bind-menu, select, input'
        )
      )
        return;

      const tabs: WorldBookTab[] = ['entries', 'groups', 'snapshots', 'monitor'];
      const curIndex = tabs.indexOf(lorebookState.activeTab);
      if (deltaX < 0) {
        // 左滑 -> 下一个 tab
        if (curIndex < tabs.length - 1) {
          lorebookState.activeTab = tabs[curIndex + 1];
        }
      } else {
        // 右滑 -> 上一个 tab
        if (curIndex > 0) {
          lorebookState.activeTab = tabs[curIndex - 1];
        }
      }
    }
  }
}

// 批量管理世界书方法
function openBatchBookModal() {
  selectedBookNames.value = [];
  batchImportFilesList.value = [];
  batchBookTab.value = 'delete';
  showBatchBookModal.value = true;
}

function selectAllBooks() {
  selectedBookNames.value = [...lorebookState.books];
}

function invertSelectBooks() {
  const currentSet = new Set(selectedBookNames.value);
  selectedBookNames.value = lorebookState.books.filter(b => !currentSet.has(b));
}

const isBatchDeleting = ref(false);
const isBatchImporting = ref(false);
const isDraggingDropzone = ref(false);

async function handleExecuteBatchDeleteBooks() {
  if (!selectedBookNames.value.length || isBatchDeleting.value) return;
  isBatchDeleting.value = true;
  try {
    const ok = await batchDeleteBooks(selectedBookNames.value);
    if (ok) {
      selectedBookNames.value = [];
      showBatchBookModal.value = false;
    }
  } finally {
    isBatchDeleting.value = false;
  }
}

function triggerBatchFilePicker() {
  if (batchFileInput.value) {
    batchFileInput.value.value = '';
    batchFileInput.value.click();
  }
}

function handleBatchFileSelect(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (!files || !files.length) return;
  batchImportFilesList.value = Array.from(files);
}

function handleBatchFileDrop(e: DragEvent) {
  isDraggingDropzone.value = false;
  const files = e.dataTransfer?.files;
  if (!files || !files.length) return;
  const jsonFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.json'));
  if (jsonFiles.length) {
    batchImportFilesList.value = jsonFiles;
  } else {
    toast('请拖入 .json 格式的世界书文件', 'warning');
  }
}

async function handleExecuteBatchImport() {
  if (!batchImportFilesList.value.length || isBatchImporting.value) return;
  isBatchImporting.value = true;
  try {
    const res = await batchImportBooks(batchImportFilesList.value);
    if (res.success > 0) {
      batchImportFilesList.value = [];
      showBatchBookModal.value = false;
    }
  } finally {
    isBatchImporting.value = false;
  }
}

function setBookScope(scope: BookScopeFilter) {
  showBindMenu.value = false;
  showBookToolsMenu.value = false;
  void switchBookScope(scope);
}

async function onBookChange(e: Event) {
  const target = e.target as HTMLSelectElement;
  if (target.value) {
    await selectWorldBook(target.value);
  }
}

async function handleCreateBook() {
  const name = newBookName.value.trim();
  if (!name) return;
  const ok = await createBook(name);
  if (ok) {
    newBookName.value = '';
    showNewBookModal.value = false;
  }
}

function openRenameModal() {
  renameBookName.value = lorebookState.currentBook;
  showRenameBookModal.value = true;
}

async function handleRenameBook() {
  const name = renameBookName.value.trim();
  if (!name || name === lorebookState.currentBook) {
    showRenameBookModal.value = false;
    return;
  }
  const ok = await renameCurrentBook(name);
  if (ok) {
    showRenameBookModal.value = false;
  }
}

function confirmDeleteEntry(uid: number, e: MouseEvent) {
  e.stopPropagation();
  entryToDelete.value = uid;
}

function handleExecuteDeleteEntry() {
  if (entryToDelete.value !== null) {
    removeEntry(entryToDelete.value);
    entryToDelete.value = null;
  }
}

function handleDuplicate(uid: number, e: MouseEvent) {
  e.stopPropagation();
  const cloned = duplicateEntry(uid);
  if (cloned) {
    nextTick(() => {
      const el = document.querySelector(`[data-uid="${cloned.uid}"]`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }
}

function handleTakeSnapshot() {
  const name = newSnapshotName.value.trim();
  takeSnapshot(name);
  newSnapshotName.value = '';
  showCreateSnapshotModal.value = false;
}

function openDiff(snap: WorldBookSnapshot) {
  activeDiffSnapshot.value = snap;
  showDiffModal.value = true;
}

function confirmOverwriteSnapshot(snapId: string) {
  snapshotToOverwrite.value = snapId;
  showOverwriteSnapshotModal.value = true;
}

function handleExecuteOverwrite() {
  if (snapshotToOverwrite.value) {
    overwriteBookSnapshot(snapshotToOverwrite.value);
    snapshotToOverwrite.value = null;
    showOverwriteSnapshotModal.value = false;
  }
}

function applyFromDiff() {
  if (activeDiffSnapshot.value) {
    applyBookSnapshot(activeDiffSnapshot.value);
    showDiffModal.value = false;
  }
}

function switchToMonitor() {
  lorebookState.activeTab = 'monitor';
  void checkLastActivation();
}

async function openActivatedEntry(ref: { world: string; uid: string | number }) {
  if (ref.world && ref.world !== lorebookState.currentBook) {
    await selectWorldBook(ref.world);
  }
  openEntry(Number(ref.uid));
}

function handleFileInput(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const content = ev.target?.result as string;
    if (content) {
      batchImportJson(content);
      showImportModal.value = false;
    }
  };
  reader.readAsText(file);
}

function handlePasteImport() {
  const text = importJsonText.value.trim();
  if (!text) return;
  const ok = batchImportJson(text);
  if (ok) {
    importJsonText.value = '';
    showImportModal.value = false;
  }
}

function handleExecuteBatchGroup() {
  batchSetGroup(batchGroupName.value);
  batchGroupName.value = '';
  showBatchGroupModal.value = false;
}

// ================= 批量调整顺序 (起始点 + 递增步长) =================
const batchOrderQuickSteps = [
  { value: 1, label: '+1' },
  { value: 2, label: '+2' },
  { value: 5, label: '+5' },
  { value: 10, label: '+10' },
  { value: 0, label: '0 (同值)' },
  { value: -1, label: '-1' },
];

const currentViewOrderedEntries = computed(() => {
  if (lorebookState.activeTab === 'groups') {
    return entryGroups.value.flatMap(g => g.entries);
  }
  return filteredEntries.value;
});

const batchOrderCandidateEntries = computed(() => {
  const ordered = currentViewOrderedEntries.value;
  if (batchOrderScope.value === 'selected') {
    const selectedSet = new Set(lorebookState.selectedUids);
    return ordered.filter(e => selectedSet.has(e.uid));
  }
  return ordered;
});

const batchOrderTargetEntries = computed(() => {
  const base = batchOrderCandidateEntries.value;
  if (base.length === 0) return [];
  if (batchOrderStartUid.value === null) return base;
  const idx = base.findIndex(e => e.uid === batchOrderStartUid.value);
  if (idx === -1) return base;
  return base.slice(idx);
});

const batchOrderPreviewList = computed(() => {
  const start = Number.isFinite(Number(batchOrderStartVal.value)) ? Number(batchOrderStartVal.value) : 100;
  const step = Number.isFinite(Number(batchOrderStep.value)) ? Number(batchOrderStep.value) : 1;
  return batchOrderTargetEntries.value.map((entry, idx) => ({
    uid: entry.uid,
    title: entry.comment || `#${entry.uid}`,
    oldOrder: entry.order ?? 100,
    newOrder: Math.round(start + idx * step),
  }));
});

function syncBatchOrderStartEntry(uid: number | null) {
  batchOrderStartUid.value = uid;
  if (uid === null) return;
  const target = currentViewOrderedEntries.value.find(e => e.uid === uid);
  if (target) {
    batchOrderStartVal.value = target.order ?? 100;
  }
}

function openBatchOrderModal() {
  const ordered = currentViewOrderedEntries.value;
  if (ordered.length === 0) return;
  const selectedSet = new Set(lorebookState.selectedUids);
  const orderedSelected = ordered.filter(e => selectedSet.has(e.uid));

  batchOrderScope.value = orderedSelected.length >= 2 ? 'selected' : 'from_start';
  const defaultStart = orderedSelected[0] || ordered[0];
  syncBatchOrderStartEntry(defaultStart ? defaultStart.uid : null);
  batchOrderStep.value = 1;
  showBatchOrderModal.value = true;
}

function setBatchOrderScope(scope: 'selected' | 'from_start') {
  if (scope === 'selected' && lorebookState.selectedUids.length === 0) return;
  batchOrderScope.value = scope;
  const candidates = batchOrderCandidateEntries.value;
  if (candidates.length > 0) {
    const exists = candidates.some(e => e.uid === batchOrderStartUid.value);
    if (!exists) {
      syncBatchOrderStartEntry(candidates[0].uid);
    }
  }
}

function onBatchOrderStartChange(event: Event) {
  const val = Number((event.target as HTMLSelectElement).value);
  if (!Number.isNaN(val)) {
    syncBatchOrderStartEntry(val);
  }
}

function handleExecuteBatchOrder() {
  const targetUids = batchOrderTargetEntries.value.map(e => e.uid);
  if (targetUids.length === 0) return;
  const start = Number.isFinite(Number(batchOrderStartVal.value)) ? Number(batchOrderStartVal.value) : 100;
  const step = Number.isFinite(Number(batchOrderStep.value)) ? Number(batchOrderStep.value) : 1;
  batchAdjustOrder(targetUids, start, step);
  showBatchOrderModal.value = false;
}

// ================= 分组全选状态 =================
function getGroupSelectionState(grp: EntryGroup): 'all' | 'partial' | 'none' {
  if (grp.entries.length === 0) return 'none';
  const selectedSet = new Set(lorebookState.selectedUids);
  let selectedCount = 0;
  for (const e of grp.entries) {
    if (selectedSet.has(e.uid)) selectedCount++;
  }
  if (selectedCount === 0) return 'none';
  if (selectedCount === grp.entries.length) return 'all';
  return 'partial';
}

// ================= 批量修改插入位置与深度 =================
const batchPositionOptions = [
  { pos: 0, role: 0, label: '角色定义前 (↑Char)' },
  { pos: 1, role: 0, label: '角色定义后 (↓Char)' },
  { pos: 5, role: 0, label: '示例消息前 (↑EM)' },
  { pos: 6, role: 0, label: '示例消息后 (↓EM)' },
  { pos: 2, role: 0, label: '作者注释前 (↑AN)' },
  { pos: 3, role: 0, label: '作者注释后 (↓AN)' },
  { pos: 4, role: 0, label: 'D系统 (深度注入)' },
  { pos: 4, role: 1, label: 'D用户 (深度注入)' },
  { pos: 4, role: 2, label: 'Dai (深度注入)' },
  { pos: 7, role: 0, label: '锚点 (Outlet)' },
];

const batchPosSelectedEntries = computed(() => {
  const selectedSet = new Set(lorebookState.selectedUids);
  return currentViewOrderedEntries.value.filter(e => selectedSet.has(e.uid));
});

const batchPosIsDepthMode = computed(() => batchPosKey.value.startsWith('4_'));

function formatEntryPosShort(pos: number, role: number | undefined, depth: number): string {
  if (pos === 4) {
    return `${getDepthRoleLabel({ role })} ${depth}`;
  }
  return getPositionLabel({ position: pos }) || `位置${pos}`;
}

const batchPosPreviewList = computed(() => {
  const [pos, role] = batchPosKey.value.split('_').map(Number);
  const startDepth = Number.isFinite(Number(batchDepthStart.value)) ? Number(batchDepthStart.value) : 4;
  const step = Number.isFinite(Number(batchDepthStep.value)) ? Number(batchDepthStep.value) : 0;

  return batchPosSelectedEntries.value.map((entry, idx) => {
    const oldLabel = formatEntryPosShort(entry.position ?? 0, entry.role, entry.depth ?? 4);
    let targetDepth = entry.depth ?? 4;
    if (pos === 4) {
      if (batchDepthMode.value === 'fixed') {
        targetDepth = Math.max(0, Math.min(100, Math.round(startDepth)));
      } else if (batchDepthMode.value === 'increment') {
        targetDepth = Math.max(0, Math.min(100, Math.round(startDepth + idx * step)));
      }
    }
    const newLabel = formatEntryPosShort(pos, role, targetDepth);
    return {
      uid: entry.uid,
      title: entry.comment || `#${entry.uid}`,
      oldLabel,
      newLabel,
      changed: oldLabel !== newLabel,
    };
  });
});

function openBatchPosModal() {
  if (batchPosSelectedEntries.value.length === 0) return;
  const first = batchPosSelectedEntries.value[0];
  batchPosKey.value = `${first.position ?? 0}_${first.role ?? 0}`;
  batchDepthMode.value = 'fixed';
  batchDepthStart.value = first.depth ?? 4;
  batchDepthStep.value = 1;
  showBatchPosModal.value = true;
}

function handleExecuteBatchPos() {
  const targetUids = batchPosSelectedEntries.value.map(e => e.uid);
  if (targetUids.length === 0) return;
  const [position, role] = batchPosKey.value.split('_').map(Number);
  batchAdjustPositionAndDepth({
    targetUids,
    position,
    role,
    depthMode: batchDepthMode.value,
    startDepth: Number(batchDepthStart.value),
    depthStep: Number(batchDepthStep.value),
  });
  showBatchPosModal.value = false;
}

// ================= 跨世界书批量复制 / 移动 =================
const availableTransferTargetBooks = computed(() =>
  lorebookState.books.filter(b => b !== lorebookState.currentBook),
);

function openBatchTransferModal() {
  if (lorebookState.selectedUids.length === 0) return;
  if (availableTransferTargetBooks.value.length === 0) {
    toast('暂无其他可复制或移动的目标世界书', 'warning');
    return;
  }
  if (!availableTransferTargetBooks.value.includes(batchTransferTargetBook.value)) {
    batchTransferTargetBook.value = availableTransferTargetBooks.value[0];
  }
  batchTransferMode.value = 'copy';
  batchTransferGroupMode.value = 'keep';
  batchTransferCustomGroup.value = '';
  showBatchTransferModal.value = true;
}

async function handleExecuteBatchTransfer() {
  if (isBatchTransferring.value || !batchTransferTargetBook.value) return;
  isBatchTransferring.value = true;
  try {
    const ok = await batchTransferEntries({
      targetBook: batchTransferTargetBook.value,
      mode: batchTransferMode.value,
      targetGroupMode: batchTransferGroupMode.value,
      customGroup: batchTransferCustomGroup.value,
    });
    if (ok) {
      showBatchTransferModal.value = false;
    }
  } finally {
    isBatchTransferring.value = false;
  }
}

// ================= 全局查找与批量替换 =================
const globalReplacePreview = computed(() => {
  const query = globalSearchText.value;
  if (!query || !lorebookState.bookData) {
    return { totalEntriesMatched: 0, totalHits: 0, items: [] as Array<{ uid: number; title: string; hits: number; fields: string[] }> };
  }

  const targetEntries =
    globalReplaceScope.value === 'selected'
      ? lorebookState.selectedUids
          .map(uid => lorebookState.bookData!.entries[uid])
          .filter(Boolean)
      : Object.values(lorebookState.bookData.entries).sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.uid - b.uid);

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, globalReplaceCaseSensitive.value ? 'g' : 'gi');

  let totalHits = 0;
  const items: Array<{ uid: number; title: string; hits: number; fields: string[] }> = [];

  for (const entry of targetEntries) {
    let entryHits = 0;
    const fields: string[] = [];

    if (globalReplaceInComment.value && entry.comment) {
      const m = entry.comment.match(regex);
      if (m?.length) {
        entryHits += m.length;
        fields.push('标题');
      }
    }

    if (globalReplaceInKeys.value) {
      let keyHits = 0;
      for (const k of entry.key || []) {
        const m = k.match(regex);
        if (m?.length) keyHits += m.length;
      }
      for (const k of entry.keysecondary || []) {
        const m = k.match(regex);
        if (m?.length) keyHits += m.length;
      }
      if (keyHits > 0) {
        entryHits += keyHits;
        fields.push('触发词');
      }
    }

    if (globalReplaceInContent.value && entry.content) {
      const m = entry.content.match(regex);
      if (m?.length) {
        entryHits += m.length;
        fields.push('正文');
      }
    }

    if (entryHits > 0) {
      totalHits += entryHits;
      items.push({
        uid: entry.uid,
        title: entry.comment || `#${entry.uid}`,
        hits: entryHits,
        fields,
      });
    }
  }

  return {
    totalEntriesMatched: items.length,
    totalHits,
    items,
  };
});

function openGlobalReplaceModal(preferSelected = false) {
  if (!lorebookState.bookData) return;
  globalReplaceScope.value = preferSelected && lorebookState.selectedUids.length > 0 ? 'selected' : 'all';
  if (!globalSearchText.value && lorebookState.searchQuery.trim()) {
    globalSearchText.value = lorebookState.searchQuery.trim();
  }
  showGlobalReplaceModal.value = true;
}

function handleExecuteGlobalReplace() {
  if (!globalSearchText.value) return;
  const res = batchGlobalSearchReplace({
    scope: globalReplaceScope.value,
    searchText: globalSearchText.value,
    replaceText: globalReplaceText.value,
    caseSensitive: globalReplaceCaseSensitive.value,
    inComment: globalReplaceInComment.value,
    inKeys: globalReplaceInKeys.value,
    inContent: globalReplaceInContent.value,
  });
  if (res.totalReplacements > 0) {
    showGlobalReplaceModal.value = false;
  }
}

// ================= 批量底栏按钮与「更多」自定义面板 =================
const visibleBatchActions = computed(() =>
  BATCH_ACTION_META.filter(item => item.id !== 'purple' || ui.showVectorized),
);

const pinnedBatchActions = computed(() => {
  const pinnedSet = new Set(ui.batchPinnedActions);
  return visibleBatchActions.value.filter(item => pinnedSet.has(item.id));
});

const moreBatchActions = computed(() => {
  const pinnedSet = new Set(ui.batchPinnedActions);
  return visibleBatchActions.value.filter(item => !pinnedSet.has(item.id));
});

function closeBatchBar() {
  lorebookState.isBatchMode = false;
  showBatchMoreMenu.value = false;
  isEditingBatchPins.value = false;
}

function isBatchActionDisabled(id: BatchActionId): boolean {
  switch (id) {
    case 'enable':
    case 'disable':
    case 'green':
    case 'blue':
    case 'purple':
    case 'position':
    case 'group':
    case 'transfer':
    case 'delete':
      return lorebookState.selectedUids.length === 0;
    case 'order':
      return currentViewOrderedEntries.value.length === 0;
    case 'replace':
    case 'export':
    case 'import':
      return !lorebookState.bookData;
    default:
      return false;
  }
}

function executeBatchAction(id: BatchActionId, closeMore = false) {
  if (isBatchActionDisabled(id)) return;
  if (closeMore) {
    showBatchMoreMenu.value = false;
    isEditingBatchPins.value = false;
  }
  switch (id) {
    case 'enable':
      batchEnable();
      break;
    case 'disable':
      batchDisable();
      break;
    case 'green':
      batchSetStrategy('green');
      break;
    case 'blue':
      batchSetStrategy('blue');
      break;
    case 'purple':
      batchSetStrategy('purple');
      break;
    case 'order':
      openBatchOrderModal();
      break;
    case 'position':
      openBatchPosModal();
      break;
    case 'group':
      showBatchGroupModal.value = true;
      break;
    case 'transfer':
      openBatchTransferModal();
      break;
    case 'replace':
      openGlobalReplaceModal(true);
      break;
    case 'export':
      batchExportJson();
      break;
    case 'import':
      showImportModal.value = true;
      break;
    case 'delete':
      showBatchDeleteModal.value = true;
      break;
  }
}

// ================= 世界书绑定状态与切换 =================
const isCurrentBookCharPrimary = computed(() =>
  Boolean(lorebookState.currentBook && lorebookState.boundBooks.characterPrimary === lorebookState.currentBook)
);
const isCurrentBookCharAux = computed(() =>
  Boolean(lorebookState.currentBook && lorebookState.boundBooks.characterAux.includes(lorebookState.currentBook))
);
const isCurrentBookChat = computed(() =>
  Boolean(lorebookState.currentBook && lorebookState.boundBooks.chat.includes(lorebookState.currentBook))
);
const isCurrentBookGlobal = computed(() =>
  Boolean(lorebookState.currentBook && lorebookState.boundBooks.global.includes(lorebookState.currentBook))
);

const currentBookBindCount = computed(() => {
  let count = 0;
  if (isCurrentBookCharPrimary.value) count++;
  if (isCurrentBookCharAux.value) count++;
  if (isCurrentBookChat.value) count++;
  if (isCurrentBookGlobal.value) count++;
  return count;
});

function toggleBindMenu() {
  if (!showBindMenu.value) {
    refreshBoundBooks();
  }
  showBookToolsMenu.value = false;
  showBindMenu.value = !showBindMenu.value;
}

async function handleToggleBind(type: 'charPrimary' | 'charAux' | 'chat' | 'global') {
  if (isBindingBusy.value || !lorebookState.currentBook) return;
  isBindingBusy.value = true;
  try {
    if (type === 'charPrimary') {
      await toggleCharacterPrimaryBind();
    } else if (type === 'charAux') {
      await toggleCharacterAuxBind();
    } else if (type === 'chat') {
      await toggleChatBind();
    } else if (type === 'global') {
      await toggleGlobalBind();
    }
  } finally {
    isBindingBusy.value = false;
  }
}

// ================= 分组拖拽与排序 =================
const draggedGroupName = ref<string | null>(null);
const groupDropTarget = ref<{ name: string; position: 'before' | 'after' } | null>(null);

function isGroupDropTarget(name: string, pos: 'before' | 'after'): boolean {
  return groupDropTarget.value?.name === name && groupDropTarget.value?.position === pos;
}

function onGroupDragStart(e: DragEvent, name: string) {
  draggedGroupName.value = name;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', name);
  }
}

function onGroupDragOver(e: DragEvent, name: string) {
  if (!draggedGroupName.value || draggedGroupName.value === name) {
    groupDropTarget.value = null;
    return;
  }
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move';
  }
  const el = e.currentTarget as HTMLElement | null;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  const position: 'before' | 'after' = e.clientY < midY ? 'before' : 'after';
  groupDropTarget.value = { name, position };
}

function onGroupDrop(e: DragEvent, name: string) {
  e.preventDefault();
  const srcName = draggedGroupName.value;
  const target = groupDropTarget.value;
  draggedGroupName.value = null;
  groupDropTarget.value = null;
  if (!srcName || srcName === name) return;
  const pos = target && target.name === name ? target.position : 'after';
  reorderGroups(srcName, name, pos);
}

function onGroupDragEnd() {
  draggedGroupName.value = null;
  groupDropTarget.value = null;
}

function onGroupTouchStart(e: TouchEvent, name: string) {
  if (e.touches.length !== 1) return;
  draggedGroupName.value = name;
  groupDropTarget.value = null;
}

function onGroupTouchMove(e: TouchEvent) {
  if (!draggedGroupName.value || e.touches.length !== 1) return;
  if (e.cancelable) e.preventDefault();
  const touch = e.touches[0];
  const targetEl = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null;
  const groupCard = targetEl?.closest('.group-section-card[data-group-name]') as HTMLElement | null;
  if (!groupCard) {
    groupDropTarget.value = null;
    return;
  }
  const targetName = groupCard.getAttribute('data-group-name') || '';
  if (!targetName || targetName === draggedGroupName.value) {
    groupDropTarget.value = null;
    return;
  }
  const rect = groupCard.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  const position: 'before' | 'after' = touch.clientY < midY ? 'before' : 'after';
  groupDropTarget.value = { name: targetName, position };
}

function onGroupTouchEnd() {
  const srcName = draggedGroupName.value;
  const target = groupDropTarget.value;
  draggedGroupName.value = null;
  groupDropTarget.value = null;
  if (srcName && target && srcName !== target.name) {
    reorderGroups(srcName, target.name, target.position);
  }
}
</script>

<template>
  <div class="entry-list-pane" @touchstart="handleTouchStart" @touchend="handleTouchEnd">
    <!-- 顶栏：书库选择、快捷绑定筛选与功能视图切换 -->
    <header class="book-header">
      <!-- 快捷范围胶囊栏 (全部/角色卡/当前会话/全局) -->
      <div class="book-scope-bar">
        <button
          class="scope-chip"
          :class="{ active: lorebookState.bookScope === 'all' }"
          @click="setBookScope('all')"
        >
          <span>全部</span>
        </button>
        <button
          class="scope-chip"
          :class="{ active: lorebookState.bookScope === 'character' }"
          @click="setBookScope('character')"
          title="当前角色卡绑定世界书"
        >
          <i class="fa-solid fa-user-astronaut"></i>
          <span>角色卡</span>
          <span v-if="lorebookState.boundBooks.character.length" class="chip-count">
            {{ lorebookState.boundBooks.character.length }}
          </span>
        </button>
        <button
          class="scope-chip"
          :class="{ active: lorebookState.bookScope === 'chat' }"
          @click="setBookScope('chat')"
          title="当前聊天会话绑定世界书"
        >
          <i class="fa-solid fa-comments"></i>
          <span>当前会话</span>
          <span v-if="lorebookState.boundBooks.chat.length" class="chip-count">
            {{ lorebookState.boundBooks.chat.length }}
          </span>
        </button>
        <button
          class="scope-chip"
          :class="{ active: lorebookState.bookScope === 'global' }"
          @click="setBookScope('global')"
          title="全局生效世界书"
        >
          <i class="fa-solid fa-earth-americas"></i>
          <span>全局</span>
          <span v-if="lorebookState.boundBooks.global.length" class="chip-count">
            {{ lorebookState.boundBooks.global.length }}
          </span>
        </button>
      </div>

      <!-- 世界书选择与管理操作 -->
      <div class="book-selector-row">
        <div class="select-wrapper">
          <i :class="(lorebookState.isLoadingData || lorebookState.isLoadingBooks) ? 'fa-solid fa-circle-notch fa-spin book-icon' : 'fa-solid fa-book-bookmark book-icon'"></i>
          <select
            :value="lorebookState.currentBook"
            @change="onBookChange"
            class="book-select"
            :disabled="lorebookState.isLoadingBooks"
          >
            <option v-if="filteredBooks.length === 0" value="">--- 无可用世界书 ---</option>
            <option v-for="b in filteredBooks" :key="b" :value="b">{{ b }}</option>
          </select>
        </div>

        <!-- 当前世界书绑定按钮 (仅在「全部」世界书标签页常驻顶栏；其余标签页收纳在 ... 更多菜单中) -->
        <button
          v-if="lorebookState.currentBook && lorebookState.bookScope === 'all'"
          class="icon-btn book-bind-btn"
          :class="{ active: showBindMenu || currentBookBindCount > 0 }"
          @click="toggleBindMenu"
          title="绑定当前世界书 (角色卡 / 附加 / 聊天 / 全局)"
        >
          <i class="fa-solid fa-link"></i>
          <span v-if="currentBookBindCount > 0" class="bind-count-dot">{{ currentBookBindCount }}</span>
        </button>

        <!-- 世界书绑定下拉面板 (挂载于选择行容器内，自适应窄屏绝不溢出) -->
        <div
          v-if="showBindMenu && lorebookState.currentBook"
          class="book-tools-menu-backdrop"
          @click="showBindMenu = false"
        ></div>

        <div v-if="showBindMenu && lorebookState.currentBook" class="book-bind-menu">
          <div class="bind-menu-header">
            <i class="fa-solid fa-link"></i>
            <span class="bind-menu-bookname">{{ lorebookState.currentBook }}</span>
          </div>

          <!-- 1. 绑定为角色卡主世界书 -->
          <button
            class="bind-menu-item"
            :class="{ active: isCurrentBookCharPrimary, disabled: !lorebookState.boundBooks.hasCharacter || isBindingBusy }"
            :disabled="!lorebookState.boundBooks.hasCharacter || isBindingBusy"
            @click="handleToggleBind('charPrimary')"
          >
            <div class="bind-item-lead">
              <i class="fa-solid fa-user-astronaut bind-item-icon"></i>
              <div class="bind-item-info">
                <span class="bind-item-title">绑定到角色卡 (主世界书)</span>
                <span class="bind-item-sub">
                  <template v-if="!lorebookState.boundBooks.hasCharacter">未选择角色卡</template>
                  <template v-else-if="isCurrentBookCharPrimary">
                    已绑定角色「{{ lorebookState.boundBooks.characterName || '当前角色' }}」
                  </template>
                  <template v-else-if="lorebookState.boundBooks.characterPrimary">
                    当前主书: {{ lorebookState.boundBooks.characterPrimary }}
                  </template>
                  <template v-else>
                    角色「{{ lorebookState.boundBooks.characterName || '当前角色' }}」暂未绑定主书
                  </template>
                </span>
              </div>
            </div>
            <span class="bind-switch-pill" :class="{ on: isCurrentBookCharPrimary }">
              <span class="bind-switch-knob"></span>
            </span>
          </button>

          <!-- 2. 绑定为角色卡附加世界书 -->
          <button
            class="bind-menu-item"
            :class="{ active: isCurrentBookCharAux, disabled: !lorebookState.boundBooks.hasCharacter || isBindingBusy }"
            :disabled="!lorebookState.boundBooks.hasCharacter || isBindingBusy"
            @click="handleToggleBind('charAux')"
          >
            <div class="bind-item-lead">
              <i class="fa-solid fa-book-medical bind-item-icon"></i>
              <div class="bind-item-info">
                <span class="bind-item-title">绑定为附加世界书</span>
                <span class="bind-item-sub">
                  <template v-if="!lorebookState.boundBooks.hasCharacter">未选择角色卡</template>
                  <template v-else-if="isCurrentBookCharAux">
                    已作为「{{ lorebookState.boundBooks.characterName || '当前角色' }}」的附加世界书
                  </template>
                  <template v-else>
                    当前附加书 ({{ lorebookState.boundBooks.characterAux.length }} 本)
                  </template>
                </span>
              </div>
            </div>
            <span class="bind-switch-pill" :class="{ on: isCurrentBookCharAux }">
              <span class="bind-switch-knob"></span>
            </span>
          </button>

          <!-- 3. 绑定到当前聊天 -->
          <button
            class="bind-menu-item"
            :class="{ active: isCurrentBookChat, disabled: !lorebookState.boundBooks.hasChat || isBindingBusy }"
            :disabled="!lorebookState.boundBooks.hasChat || isBindingBusy"
            @click="handleToggleBind('chat')"
          >
            <div class="bind-item-lead">
              <i class="fa-solid fa-comments bind-item-icon"></i>
              <div class="bind-item-info">
                <span class="bind-item-title">绑定到当前聊天</span>
                <span class="bind-item-sub">
                  <template v-if="!lorebookState.boundBooks.hasChat">当前无活跃聊天会话</template>
                  <template v-else-if="isCurrentBookChat">已绑定至当前聊天会话</template>
                  <template v-else-if="lorebookState.boundBooks.chat.length">
                    当前会话已绑: {{ lorebookState.boundBooks.chat[0] }}
                  </template>
                  <template v-else>当前会话暂未绑定世界书</template>
                </span>
              </div>
            </div>
            <span class="bind-switch-pill" :class="{ on: isCurrentBookChat }">
              <span class="bind-switch-knob"></span>
            </span>
          </button>

          <!-- 4. 绑定为全局世界书 -->
          <button
            class="bind-menu-item"
            :class="{ active: isCurrentBookGlobal, disabled: isBindingBusy }"
            :disabled="isBindingBusy"
            @click="handleToggleBind('global')"
          >
            <div class="bind-item-lead">
              <i class="fa-solid fa-earth-americas bind-item-icon"></i>
              <div class="bind-item-info">
                <span class="bind-item-title">绑定为全局世界书</span>
                <span class="bind-item-sub">
                  <template v-if="isCurrentBookGlobal">已在全局世界书中启用</template>
                  <template v-else>当前全局已启用 {{ lorebookState.boundBooks.global.length }} 本</template>
                </span>
              </div>
            </div>
            <span class="bind-switch-pill" :class="{ on: isCurrentBookGlobal }">
              <span class="bind-switch-knob"></span>
            </span>
          </button>
        </div>

        <!-- 批量整理条目模式开关 -->
        <button
          v-if="lorebookState.currentBook"
          class="icon-btn"
          :class="{ active: lorebookState.isBatchMode }"
          @click="toggleBatchMode"
          title="批量整理条目模式"
        >
          <i class="fa-solid fa-list-check"></i>
        </button>

        <!-- 操作历史与撤回 (近20条记录) -->
        <button
          class="icon-btn"
          @click="showHistoryModal = true"
          title="操作日志与撤回"
        >
          <i class="fa-solid fa-clock-rotate-left"></i>
        </button>

        <!-- 更多世界书操作菜单 -->
        <div class="book-tools-dropdown-wrapper">
          <button
            class="icon-btn"
            :class="{ active: showBookToolsMenu }"
            @click="showBookToolsMenu = !showBookToolsMenu"
            title="世界书操作菜单"
          >
            <i class="fa-solid fa-ellipsis-vertical"></i>
          </button>

          <!-- 点击外部关闭遮罩 -->
          <div
            v-if="showBookToolsMenu"
            class="book-tools-menu-backdrop"
            @click="showBookToolsMenu = false"
          ></div>

          <div v-if="showBookToolsMenu" class="book-tools-menu">
            <button
              class="book-tools-menu-item"
              @click="showNewBookModal = true; showBookToolsMenu = false"
            >
              <i class="fa-solid fa-folder-plus"></i>
              <span>新建世界书</span>
            </button>

            <button
              v-if="lorebookState.currentBook && lorebookState.bookScope !== 'all'"
              class="book-tools-menu-item"
              @click="toggleBindMenu()"
            >
              <i class="fa-solid fa-link"></i>
              <span>世界书绑定设置</span>
              <span v-if="currentBookBindCount > 0" class="menu-bind-badge">{{ currentBookBindCount }}</span>
            </button>

            <button
              v-if="lorebookState.currentBook"
              class="book-tools-menu-item"
              @click="openRenameModal(); showBookToolsMenu = false"
            >
              <i class="fa-solid fa-pen-to-square"></i>
              <span>重命名当前世界书</span>
            </button>

            <button
              v-if="lorebookState.currentBook"
              class="book-tools-menu-item"
              @click="openGlobalReplaceModal(false); showBookToolsMenu = false"
            >
              <i class="fa-solid fa-repeat"></i>
              <span>全局查找与批量替换</span>
            </button>

            <button
              class="book-tools-menu-item"
              @click="openBatchBookModal(); showBookToolsMenu = false"
            >
              <i class="fa-solid fa-boxes-stacked"></i>
              <span>批量管理 (导入/删除)</span>
            </button>

            <button
              class="book-tools-menu-item"
              @click="loadWorldBooks(true); showBookToolsMenu = false"
              :class="{ spinning: lorebookState.isLoadingBooks }"
            >
              <i class="fa-solid fa-rotate-right"></i>
              <span>刷新世界书与词条数据</span>
            </button>

            <div v-if="lorebookState.currentBook" class="book-tools-menu-divider"></div>

            <button
              v-if="lorebookState.currentBook"
              class="book-tools-menu-item danger"
              @click="showDeleteBookModal = true; showBookToolsMenu = false"
            >
              <i class="fa-solid fa-trash-can"></i>
              <span>删除当前世界书</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 四大功能视图微型切换栏 (条目 / 分组 / 快照 / 监控) - 纯图标模式 -->
      <nav class="view-tabs-bar">
        <button
          class="view-tab-btn"
          :class="{ active: lorebookState.activeTab === 'entries' }"
          @click="lorebookState.activeTab = 'entries'"
          title="条目列表"
        >
          <i class="fa-solid fa-list-ul"></i>
        </button>

        <button
          class="view-tab-btn"
          :class="{ active: lorebookState.activeTab === 'groups' }"
          @click="lorebookState.activeTab = 'groups'"
          title="条目分组"
        >
          <i class="fa-solid fa-folder-tree"></i>
          <span class="tab-count-pill" v-if="entryGroups.length">{{ entryGroups.length }}</span>
        </button>

        <button
          class="view-tab-btn"
          :class="{ active: lorebookState.activeTab === 'snapshots' }"
          @click="lorebookState.activeTab = 'snapshots'"
          title="状态快照"
        >
          <i class="fa-solid fa-camera"></i>
          <span class="tab-count-pill" v-if="lorebookState.snapshots.length">{{ lorebookState.snapshots.length }}</span>
        </button>

        <button
          class="view-tab-btn"
          :class="{ active: lorebookState.activeTab === 'monitor' }"
          @click="switchToMonitor"
          title="监控统计"
        >
          <i class="fa-solid fa-gauge-high"></i>
        </button>
      </nav>

      <!-- 搜索、排序与下拉框状态筛选（仅在条目与分组模式显示） -->
      <div v-if="lorebookState.activeTab === 'entries' || lorebookState.activeTab === 'groups'" class="filter-row">
        <div class="search-box">
          <i class="fa-solid fa-magnifying-glass search-icon"></i>
          <input
            v-model="lorebookState.searchQuery"
            type="text"
            placeholder="..."
            class="search-input"
          />
          <div class="search-right-tools">
            <button
              v-if="lorebookState.searchQuery"
              class="search-inline-btn"
              @click="lorebookState.searchQuery = ''"
              title="清空搜索"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
            <button
              v-if="lorebookState.currentBook"
              class="search-inline-btn"
              @click="openGlobalReplaceModal(false)"
              title="全局查找与批量替换"
            >
              <i class="fa-solid fa-repeat"></i>
            </button>
          </div>
        </div>

        <!-- 排序下拉列表 (对齐酒馆原生功能，支持各世界书独立绑定记忆) -->
        <div class="sort-wrapper" :title="lorebookState.currentBook ? `条目显示/排序方式（已绑定《${lorebookState.currentBook}》）` : '条目显示/排序方式'">
          <select
            v-model="lorebookState.sortOrder"
            class="sort-select"
            :title="lorebookState.currentBook ? `条目显示/排序方式（已绑定《${lorebookState.currentBook}》）` : '条目显示/排序方式'"
          >
            <option value="priority">优先级</option>
            <option value="custom">自定义</option>
            <option value="title_asc">标题 A-Z</option>
            <option value="title_desc">标题 Z-A</option>
            <option value="token_asc">Token ↗</option>
            <option value="token_desc">Token ↘</option>
            <option value="depth_asc">深度 ↗</option>
            <option value="depth_desc">深度 ↘</option>
            <option value="order_asc">顺序 ↗</option>
            <option value="order_desc">顺序 ↘</option>
            <option value="uid_asc">UID ↗</option>
            <option value="uid_desc">UID ↘</option>
            <option value="prob_asc">概率% ↗</option>
            <option value="prob_desc">概率% ↘</option>
          </select>
        </div>

        <!-- 下拉框状态与策略筛选 -->
        <div class="filter-wrapper">
          <select v-model="lorebookState.filterType" class="filter-select">
            <option value="all">全部</option>
            <option value="constant">常驻 (蓝灯)</option>
            <option value="enabled">触发 (绿灯)</option>
            <option v-if="ui.showVectorized" value="vectorized">链接 (紫灯)</option>
            <option value="disabled">停用 (灰灯)</option>
          </select>
        </div>
      </div>
    </header>

    <!-- 主展示区 -->
    <main ref="entriesScrollArea" class="entries-scroll-area" @scroll="onScroll">
      <div v-if="lorebookState.isLoadingData && !lorebookState.bookData" class="state-icon-box">
        <i class="fa-solid fa-circle-notch fa-spin"></i>
      </div>

      <!-- ================= 视图 1：纯净条目平铺列表 ================= -->
      <div v-else-if="lorebookState.activeTab === 'entries'">
        <div v-if="filteredEntries.length === 0" class="state-icon-box">
          <i class="fa-solid fa-folder-open"></i>
        </div>

        <div v-else class="entries-list">
          <div
            v-for="entry in filteredEntries"
            :key="entry.uid"
            :data-uid="entry.uid"
            class="entry-card"
            :class="{
              active: lorebookState.activeUid === entry.uid,
              disabled: entry.disable,
              selected: lorebookState.selectedUids.includes(entry.uid),
            }"
            @click="lorebookState.isBatchMode ? toggleSelectUid(entry.uid) : openEntry(entry.uid)"
          >
            <!-- 第一行：多选勾选框/条目名（纯净大触控区） + 右侧快捷操作（启停圆点、复制、删除） -->
            <div class="card-row-top">
              <div class="card-row-lead">
                <!-- 批量多选模式圆形复选框 -->
                <button
                  v-if="lorebookState.isBatchMode"
                  class="batch-check-btn"
                  @click.stop="toggleSelectUid(entry.uid)"
                >
                  <i :class="lorebookState.selectedUids.includes(entry.uid) ? 'fa-solid fa-circle-check text-accent' : 'fa-regular fa-circle text-muted'"></i>
                </button>
                <span class="entry-title">{{ entry.comment || '---' }}</span>
              </div>

              <div class="card-quick-actions" v-if="!lorebookState.isBatchMode">
                <!-- 独立启停总开关 (圆点指示灯，右上角独立热区，防误触) -->
                <button
                  class="card-status-toggle-btn"
                  @click.stop="toggleEntryDisable(entry.uid)"
                  :title="entry.disable ? '已停用 (点击开启)' : '已启用 (点击停用)'"
                >
                  <span
                    class="status-indicator-dot"
                    :class="{
                      'dot-gray': entry.disable,
                      'dot-blue': !entry.disable && entry.constant,
                      'dot-purple': !entry.disable && entry.vectorized,
                      'dot-green': !entry.disable && !entry.constant && !entry.vectorized,
                    }"
                  ></span>
                </button>

                <button
                  class="card-act-btn"
                  @click.stop="handleDuplicate(entry.uid, $event)"
                  title="复制词条"
                >
                  <i class="fa-solid fa-clone"></i>
                </button>
                <button
                  class="card-act-btn card-del-btn"
                  @click.stop="confirmDeleteEntry(entry.uid, $event)"
                  title="删除词条"
                >
                  <i class="fa-solid fa-trash-can"></i>
                </button>
                <i class="fa-solid fa-chevron-right chevron-icon"></i>
              </div>
            </div>

            <!-- 第二行：小字放其余信息 (策略、所属分组、停用、位置、顺序、关键词) -->
            <div class="card-row-sub">
              <div class="card-meta-tags">
                <!-- 激活策略灯下拉菜单 (减少误触) -->
                <div
                  class="strategy-pill-dropdown"
                  :class="{
                    'pill-purple': entry.vectorized,
                    'pill-blue': !entry.vectorized && entry.constant,
                    'pill-green': !entry.vectorized && !entry.constant,
                  }"
                  @click.stop
                >
                  <span class="pill-lamp-dot"></span>
                  <select
                    class="strategy-select"
                    :value="getEntryStrategy(entry)"
                    @change="onStrategySelect(entry.uid, $event)"
                  >
                    <option value="green">绿灯</option>
                    <option value="blue">蓝灯</option>
                    <option v-if="ui.showVectorized" value="purple">链接</option>
                  </select>
                  <i class="fa-solid fa-caret-down pill-dropdown-arrow"></i>
                </div>

                <!-- 停用状态注明 -->
                <span v-if="entry.disable" class="badge-tag tag-gray">已停用</span>

                <!-- 所属分组徽章 (纯 UI 视觉分类) -->
                <span v-if="entry.display_group && entry.display_group.trim()" class="badge-tag tag-group" :title="`所属 UI 分组: ${entry.display_group}`">
                  <i class="fa-solid fa-folder"></i>
                  {{ entry.display_group }}
                </span>

                <!-- 酒馆原生互斥组徽章 (如果条目配置了原生互斥组) -->
                <span v-if="entry.group && entry.group.trim()" class="badge-tag tag-mutex" :title="`酒馆原生互斥组 (同组每次仅随机/评分激活一条): ${entry.group}`">
                  <i class="fa-solid fa-arrows-split-up-and-left"></i>
                  互斥: {{ entry.group }}
                </span>

                <!-- 位置与深度注明 -->
                <span v-if="entry.position === 4" class="badge-tag" :class="getDepthRoleClass(entry)">
                  {{ getDepthRoleLabel(entry) }} {{ entry.depth ?? 4 }}
                </span>
                <span v-else-if="getPositionLabel(entry)" class="badge-tag tag-pos">
                  {{ getPositionLabel(entry) }}
                </span>

                <!-- 顺序号与单条预估 Token 微标 -->
                <span class="badge-order">#{{ entry.order ?? 100 }}</span>
                <span class="badge-token" title="正文预估 Token">~{{ estimateTextTokens(entry.content || '') }}tk</span>
              </div>

              <!-- 关键词流 -->
              <div class="card-keywords" v-if="entry.key && entry.key.length > 0">
                <span
                  v-for="(k, idx) in entry.key.slice(0, 3)"
                  :key="idx"
                  class="mini-key-tag"
                >
                  {{ k }}
                </span>
                <span v-if="entry.key.length > 3" class="mini-key-more">
                  +{{ entry.key.length - 3 }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ================= 视图 2：条目分组视图 (参照用户提供原型，折叠展开+组统计+组总开关) ================= -->
      <div v-else-if="lorebookState.activeTab === 'groups'" class="groups-view-container">
        <div v-if="entryGroups.length === 0" class="state-icon-box">
          <i class="fa-solid fa-folder-open"></i>
        </div>

        <div v-else class="groups-flow">
          <div
            v-for="(grp, gIdx) in entryGroups"
            :key="grp.name"
            :data-group-name="grp.name"
            class="group-section-card"
            :class="{
              'group-dragging': draggedGroupName === grp.name,
              'group-drop-before': isGroupDropTarget(grp.name, 'before'),
              'group-drop-after': isGroupDropTarget(grp.name, 'after'),
            }"
          >
            <!-- 组行卡片 (拖拽手柄、折叠箭头、分组名、上下排序、启用计数、组总开关) -->
            <div
              class="group-header-row"
              draggable="true"
              @dragstart="onGroupDragStart($event, grp.name)"
              @dragover="onGroupDragOver($event, grp.name)"
              @drop.stop="onGroupDrop($event, grp.name)"
              @dragend="onGroupDragEnd"
              @click="toggleGroupFold(grp.name)"
            >
              <div class="group-lead-info">
                <button
                  v-if="lorebookState.isBatchMode"
                  class="batch-check-btn group-batch-check-btn"
                  @click.stop="toggleSelectGroup(grp.name)"
                  :title="getGroupSelectionState(grp) === 'all' ? '取消全选本组' : '一键全选本组'"
                >
                  <i
                    :class="
                      getGroupSelectionState(grp) === 'all'
                        ? 'fa-solid fa-circle-check text-accent'
                        : getGroupSelectionState(grp) === 'partial'
                        ? 'fa-solid fa-circle-minus text-accent'
                        : 'fa-regular fa-circle text-muted'
                    "
                  ></i>
                </button>
                <span
                  v-if="entryGroups.length > 1"
                  class="group-drag-handle"
                  title="长按或拖拽调整分组顺序"
                  @click.stop
                  @touchstart.stop="onGroupTouchStart($event, grp.name)"
                  @touchmove.stop="onGroupTouchMove($event)"
                  @touchend.stop="onGroupTouchEnd"
                  @touchcancel.stop="onGroupTouchEnd"
                >
                  <i class="fa-solid fa-grip-vertical"></i>
                </span>
                <i
                  class="fa-solid fa-chevron-right group-chevron"
                  :class="{ expanded: lorebookState.expandedGroups[grp.name] }"
                ></i>
                <span class="group-title-text">{{ grp.name }}</span>
              </div>

              <div class="group-actions-right">
                <!-- 分组上下移动排序按钮 -->
                <div v-if="entryGroups.length > 1" class="group-sort-btns" @click.stop>
                  <button
                    class="group-move-btn"
                    :disabled="gIdx === 0"
                    @click.stop="moveGroupOrder(grp.name, -1)"
                    title="上移分组"
                  >
                    <i class="fa-solid fa-angle-up"></i>
                  </button>
                  <button
                    class="group-move-btn"
                    :disabled="gIdx === entryGroups.length - 1"
                    @click.stop="moveGroupOrder(grp.name, 1)"
                    title="下移分组"
                  >
                    <i class="fa-solid fa-angle-down"></i>
                  </button>
                </div>

                <!-- 启用数 / 总数计数 -->
                <span class="group-count-pill" :class="{ 'count-active': grp.enabledCount > 0 }">
                  {{ grp.enabledCount }}/{{ grp.totalCount }}
                </span>

                <!-- 组级一键总开关 (iOS 极简滑动开关) -->
                <button
                  class="group-switch-pill"
                  :class="{ on: grp.allEnabled, half: grp.enabledCount > 0 && !grp.allEnabled }"
                  @click.stop="toggleGroupEnabled(grp.name)"
                  :title="grp.allEnabled ? '全部开启中 (点击全部停用)' : '点击全部开启'"
                >
                  <span class="group-switch-knob"></span>
                </button>
              </div>
            </div>

            <!-- 分组展开后的词条卡片流 -->
            <div
              v-show="lorebookState.expandedGroups[grp.name]"
              class="group-entries-container"
            >
              <div
                v-for="entry in grp.entries"
                :key="entry.uid"
                :data-uid="entry.uid"
                class="entry-card"
                :class="{
                  active: lorebookState.activeUid === entry.uid,
                  disabled: entry.disable,
                  selected: lorebookState.selectedUids.includes(entry.uid),
                }"
                @click="lorebookState.isBatchMode ? toggleSelectUid(entry.uid) : openEntry(entry.uid)"
              >
                <!-- 第一行：标题 + 右侧快捷操作 -->
                <div class="card-row-top">
                  <div class="card-row-lead">
                    <button
                      v-if="lorebookState.isBatchMode"
                      class="batch-check-btn"
                      @click.stop="toggleSelectUid(entry.uid)"
                    >
                      <i :class="lorebookState.selectedUids.includes(entry.uid) ? 'fa-solid fa-circle-check text-accent' : 'fa-regular fa-circle text-muted'"></i>
                    </button>
                    <span class="entry-title">{{ entry.comment || '---' }}</span>
                  </div>

                  <div class="card-quick-actions" v-if="!lorebookState.isBatchMode">
                    <button
                      class="card-status-toggle-btn"
                      @click.stop="toggleEntryDisable(entry.uid)"
                      :title="entry.disable ? '已停用 (点击开启)' : '已启用 (点击停用)'"
                    >
                      <span
                        class="status-indicator-dot"
                        :class="{
                          'dot-gray': entry.disable,
                          'dot-blue': !entry.disable && entry.constant,
                          'dot-purple': !entry.disable && entry.vectorized,
                          'dot-green': !entry.disable && !entry.constant && !entry.vectorized,
                        }"
                      ></span>
                    </button>

                    <button
                      class="card-act-btn"
                      @click.stop="handleDuplicate(entry.uid, $event)"
                      title="复制"
                    >
                      <i class="fa-solid fa-clone"></i>
                    </button>
                    <button
                      class="card-act-btn card-del-btn"
                      @click.stop="confirmDeleteEntry(entry.uid, $event)"
                      title="删除"
                    >
                      <i class="fa-solid fa-trash-can"></i>
                    </button>
                    <i class="fa-solid fa-chevron-right chevron-icon"></i>
                  </div>
                </div>

                <!-- 第二行：策略胶囊与元信息 -->
                <div class="card-row-sub">
                  <div class="card-meta-tags">
                    <!-- 激活策略灯下拉菜单 (减少误触) -->
                    <div
                      class="strategy-pill-dropdown"
                      :class="{
                        'pill-purple': entry.vectorized,
                        'pill-blue': !entry.vectorized && entry.constant,
                        'pill-green': !entry.vectorized && !entry.constant,
                      }"
                      @click.stop
                    >
                      <span class="pill-lamp-dot"></span>
                      <select
                        class="strategy-select"
                        :value="getEntryStrategy(entry)"
                        @change="onStrategySelect(entry.uid, $event)"
                      >
                        <option value="green">绿灯</option>
                        <option value="blue">蓝灯</option>
                        <option v-if="ui.showVectorized" value="purple">链接</option>
                      </select>
                      <i class="fa-solid fa-caret-down pill-dropdown-arrow"></i>
                    </div>
                    <span v-if="entry.disable" class="badge-tag tag-gray">已停用</span>
                    <span v-if="entry.group && entry.group.trim()" class="badge-tag tag-mutex" :title="`酒馆原生互斥组 (同组每次仅随机/评分激活一条): ${entry.group}`">
                      <i class="fa-solid fa-arrows-split-up-and-left"></i>
                      互斥: {{ entry.group }}
                    </span>
                    <span v-if="entry.position === 4" class="badge-tag" :class="getDepthRoleClass(entry)">
                      {{ getDepthRoleLabel(entry) }} {{ entry.depth ?? 4 }}
                    </span>
                    <span v-else-if="getPositionLabel(entry)" class="badge-tag tag-pos">
                      {{ getPositionLabel(entry) }}
                    </span>
                    <span class="badge-order">#{{ entry.order ?? 100 }}</span>
                    <span class="badge-token" title="正文预估 Token">~{{ estimateTextTokens(entry.content || '') }}tk</span>
                  </div>

                  <div class="card-keywords" v-if="entry.key && entry.key.length > 0">
                    <span
                      v-for="(k, idx) in entry.key.slice(0, 2)"
                      :key="idx"
                      class="mini-key-tag"
                    >
                      {{ k }}
                    </span>
                    <span v-if="entry.key.length > 2" class="mini-key-more">
                      +{{ entry.key.length - 2 }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ================= 视图 3：世界书状态快照 (Snapshots View) ================= -->
      <div v-else-if="lorebookState.activeTab === 'snapshots'" class="snapshots-view-container">
        <!-- 顶部：快照统计与单一图标新建按钮 (点击弹窗命名保存) -->
        <div class="snapshots-header-row">
          <div class="snap-header-lead">
            <i class="fa-solid fa-camera camera-lead-icon"></i>
            <span class="snap-header-title">快照记录</span>
            <span class="snap-header-badge" v-if="lorebookState.snapshots.length">{{ lorebookState.snapshots.length }}</span>
          </div>
          <button
            class="icon-btn btn-accent"
            @click="showCreateSnapshotModal = true"
            title="拍照保存当前条目状态"
          >
            <i class="fa-solid fa-camera-retro"></i>
          </button>
        </div>

        <div v-if="lorebookState.snapshots.length === 0" class="state-icon-box">
          <i class="fa-solid fa-box-open"></i>
        </div>

        <!-- 快照列表卡片 -->
        <div v-else class="snapshots-list">
          <div
            v-for="snap in lorebookState.snapshots"
            :key="snap.id"
            class="snapshot-card"
          >
            <div class="snap-info">
              <div class="snap-title-row">
                <span class="snap-name">{{ snap.name }}</span>
                <!-- 当前开启与快照对比指示胶囊 -->
                <button
                  class="snap-diff-chip"
                  @click="openDiff(snap)"
                  title="点击查看状态对比"
                >
                  <template v-if="getSnapshotDiff(snap).identical">
                    <i class="fa-solid fa-equals"></i>
                    <span>一致</span>
                  </template>
                  <template v-else>
                    <span v-if="getSnapshotDiff(snap).toEnable.length > 0" class="diff-tag-plus">
                      +{{ getSnapshotDiff(snap).toEnable.length }}
                    </span>
                    <span v-if="getSnapshotDiff(snap).toDisable.length > 0" class="diff-tag-minus">
                      -{{ getSnapshotDiff(snap).toDisable.length }}
                    </span>
                  </template>
                </button>
              </div>
              <div class="snap-meta">
                <span class="snap-time">{{ new Date(snap.createdAt).toLocaleDateString() }}</span>
                <span class="snap-count">开启 {{ snap.activeCount }}/{{ snap.totalCount }}</span>
              </div>
            </div>

            <!-- 纯图标操作组 (应用、覆盖、对比、删除) -->
            <div class="snap-actions">
              <button
                class="snap-icon-btn btn-apply"
                @click="applyBookSnapshot(snap)"
                title="应用快照"
              >
                <i class="fa-solid fa-play"></i>
              </button>
              <button
                class="snap-icon-btn"
                @click="confirmOverwriteSnapshot(snap.id)"
                title="用当前状态覆盖此快照"
              >
                <i class="fa-solid fa-arrow-rotate-right"></i>
              </button>
              <button
                class="snap-icon-btn"
                @click="openDiff(snap)"
                title="查看对比详情"
              >
                <i class="fa-solid fa-code-compare"></i>
              </button>
              <button
                class="snap-icon-btn btn-del"
                @click="removeBookSnapshot(snap.id)"
                title="删除快照"
              >
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ================= 视图 4：监控与统计 (Monitor & Stats View) ================= -->
      <div v-else-if="lorebookState.activeTab === 'monitor'" class="monitor-view-container">
        <!-- 统计指标网格 -->
        <section class="stats-overview-grid">
          <div class="stat-metric-card">
            <span class="metric-label">条目数量</span>
            <div class="metric-value">
              <span class="num-highlight">{{ bookStats.activeEntries }}</span>
              <span class="num-sub">/ {{ bookStats.totalEntries }} 启用</span>
            </div>
          </div>

          <div class="stat-metric-card">
            <div class="metric-label-row">
              <span class="metric-label">{{ tokenStatMode === 'enabled' ? '当前启用 Token' : '上轮注入 Token' }}</span>
              <div class="metric-mode-pills">
                <button
                  type="button"
                  class="metric-mode-pill"
                  :class="{ active: tokenStatMode === 'enabled' }"
                  @click="tokenStatMode = 'enabled'"
                  title="仅统计当前已启用词条的正文 Token"
                >
                  启用
                </button>
                <button
                  type="button"
                  class="metric-mode-pill"
                  :class="{ active: tokenStatMode === 'activated' }"
                  @click="tokenStatMode = 'activated'"
                  title="统计上一轮实际注入的词条 Token"
                >
                  上轮
                </button>
              </div>
            </div>
            <div v-if="tokenStatMode === 'enabled'" class="metric-value">
              <span class="num-highlight">~{{ bookStats.enabledTokens }}</span>
              <span class="num-sub">tk ({{ bookStats.enabledChars }} 字)</span>
            </div>
            <div v-else class="metric-value">
              <span class="num-highlight">~{{ bookStats.activatedTokens }}</span>
              <span class="num-sub">tk ({{ bookStats.activatedCount }} 条)</span>
            </div>
            <div class="metric-sub-hint">
              <span v-if="tokenStatMode === 'enabled'">
                常驻保底 ~{{ bookStats.constantTokens }}tk · 上轮注入 ~{{ bookStats.activatedTokens }}tk
              </span>
              <span v-else>
                当前启用 ~{{ bookStats.enabledTokens }}tk · 常驻保底 ~{{ bookStats.constantTokens }}tk
              </span>
            </div>
          </div>

          <div class="stat-metric-card">
            <span class="metric-label">策略分布</span>
            <div class="metric-sub-tags">
              <span class="tag-blue badge-tag">常驻: {{ bookStats.constantCount }}</span>
              <span class="tag-green badge-tag">触发: {{ bookStats.selectiveCount }}</span>
              <span v-if="ui.showVectorized" class="tag-purple badge-tag">链接: {{ bookStats.vectorizedCount }}</span>
            </div>
          </div>

          <div class="stat-metric-card">
            <span class="metric-label">分组统计</span>
            <div class="metric-value">
              <span class="num-highlight">{{ bookStats.groupCount }}</span>
              <span class="num-sub">个独立显示组</span>
            </div>
          </div>
        </section>

        <!-- 上一轮触发监视器 (使用 window.__TAURITAVERN__.api.worldInfo) -->
        <section class="activation-monitor-section">
          <header class="section-head-row">
            <div class="head-lead">
              <i class="fa-solid fa-bolt text-accent"></i>
              <span class="section-title">上一轮实际触发监视</span>
            </div>
            <button class="icon-btn-ghost" @click="checkLastActivation" title="刷新激活状态">
              <i class="fa-solid fa-rotate-right"></i>
            </button>
          </header>

          <div v-if="!lorebookState.lastActivationBatch || lorebookState.lastActivationBatch.entries.length === 0" class="monitor-empty-box">
            <i class="fa-regular fa-circle-check empty-check-icon"></i>
            <span>上一轮生成未触发任何世界书条目（或尚未发生对话）</span>
          </div>

          <div v-else class="activated-entries-list">
            <div
              v-for="entry in lorebookState.lastActivationBatch.entries"
              :key="`${entry.world}_${entry.uid}`"
              class="activated-entry-card"
              @click="openActivatedEntry(entry)"
            >
              <div class="act-card-left">
                <span class="act-book-tag">{{ entry.world }}</span>
                <span class="act-entry-title">{{ entry.displayName }}</span>
              </div>
              <div class="act-card-right">
                <span v-if="getActivationEntryStats(entry).tokens > 0" class="badge-token">~{{ getActivationEntryStats(entry).tokens }}tk</span>
                <span v-if="entry.constant" class="badge-tag tag-blue">常驻</span>
                <span v-else class="badge-tag tag-green">按词触发</span>
                <span v-if="entry.position" class="badge-tag tag-depth">{{ entry.position }}</span>
                <i class="fa-solid fa-chevron-right chevron-icon"></i>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>

    <!-- 底部批量整理浮动栏 (仅在 isBatchMode 时浮起) -->
    <Transition name="slide-up">
      <footer v-if="lorebookState.isBatchMode" class="batch-floating-bar">
        <!-- 更多面板点击外部关闭遮罩 -->
        <div
          v-if="showBatchMoreMenu"
          class="batch-more-backdrop"
          @click="showBatchMoreMenu = false; isEditingBatchPins = false"
        ></div>

        <!-- 向上弹出的「更多批量操作 / 自定义底栏」宫格面板 -->
        <Transition name="more-pop">
          <div v-if="showBatchMoreMenu" class="batch-more-popover">
            <div class="batch-more-head">
              <span class="batch-more-title">
                {{ isEditingBatchPins ? '自定义底栏常驻按钮' : '更多批量操作' }}
              </span>
              <div class="batch-more-head-actions">
                <button
                  v-if="isEditingBatchPins"
                  type="button"
                  class="mini-tool-btn"
                  @click="resetBatchPinnedActions"
                >
                  恢复默认
                </button>
                <button
                  type="button"
                  class="mini-tool-btn"
                  :class="{ 'btn-pin-done': isEditingBatchPins }"
                  @click="isEditingBatchPins = !isEditingBatchPins"
                >
                  {{ isEditingBatchPins ? '完成' : '自定义' }}
                </button>
              </div>
            </div>

            <template v-if="isEditingBatchPins">
              <p class="batch-pin-tip">点击切换：高亮为常驻底栏，未高亮收纳在「更多」菜单</p>
              <div class="batch-more-grid">
                <button
                  v-for="act in visibleBatchActions"
                  :key="act.id"
                  type="button"
                  class="batch-more-cell"
                  :class="{ pinned: ui.batchPinnedActions.includes(act.id) }"
                  @click="toggleBatchPinnedAction(act.id)"
                >
                  <span v-if="act.dotClass" class="batch-light-dot" :class="act.dotClass"></span>
                  <i v-else :class="act.icon"></i>
                  <span class="batch-more-cell-label">{{ act.label }}</span>
                </button>
              </div>
            </template>

            <template v-else>
              <div v-if="moreBatchActions.length === 0" class="batch-more-empty">
                全部操作均已常驻底栏，可点右上角「自定义」收纳
              </div>
              <div v-else class="batch-more-grid">
                <button
                  v-for="act in moreBatchActions"
                  :key="act.id"
                  type="button"
                  class="batch-more-cell"
                  :class="{ danger: act.danger }"
                  :disabled="isBatchActionDisabled(act.id)"
                  @click="executeBatchAction(act.id, true)"
                  :title="act.title"
                >
                  <span v-if="act.dotClass" class="batch-light-dot" :class="act.dotClass"></span>
                  <i v-else :class="act.icon"></i>
                  <span class="batch-more-cell-label">{{ act.label }}</span>
                </button>
              </div>
            </template>
          </div>
        </Transition>

        <div class="batch-bar-lead">
          <div class="batch-counter-box">
            <span class="batch-count-text">已选 {{ lorebookState.selectedUids.length }}/{{ filteredEntries.length }}</span>
            <span v-if="lorebookState.isRangeMode" class="badge-tag tag-range">连选模式中</span>
          </div>

          <!-- 快捷勾选控制 + 固定退出按钮 -->
          <div class="batch-select-shortcuts">
            <button
              class="batch-tool-btn"
              :class="{ active: lorebookState.selectedUids.length === filteredEntries.length && filteredEntries.length > 0 }"
              @click="lorebookState.selectedUids.length === filteredEntries.length ? deselectAll() : selectAll()"
              :title="lorebookState.selectedUids.length === filteredEntries.length ? '取消全选' : '全选'"
            >
              <i class="fa-solid fa-check-double"></i>
            </button>
            <button
              class="batch-tool-btn"
              @click="invertSelection"
              title="反选"
            >
              <i class="fa-solid fa-shuffle"></i>
            </button>
            <button
              class="batch-tool-btn"
              :class="{ active: lorebookState.isRangeMode }"
              @click="lorebookState.isRangeMode = !lorebookState.isRangeMode"
              :title="lorebookState.isRangeMode ? '连选模式已开启 (点击关闭)' : '开启连选模式 (点击首尾自动区间勾选)'"
            >
              <i class="fa-solid fa-arrows-left-right-to-line"></i>
            </button>
            <button
              class="batch-tool-btn btn-exit-batch"
              @click="closeBatchBar"
              title="完成并退出多选"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <!-- 第二行：常驻按钮 + 右侧固定「更多 (⋯)」按钮 -->
        <div class="batch-actions-bar-wrap">
          <div class="batch-actions-scroll">
            <button
              v-for="act in pinnedBatchActions"
              :key="act.id"
              class="batch-action-item"
              :class="{ danger: act.danger }"
              :disabled="isBatchActionDisabled(act.id)"
              @click="executeBatchAction(act.id)"
              :title="act.title"
            >
              <span v-if="act.dotClass" class="batch-light-dot" :class="act.dotClass"></span>
              <i v-else :class="act.icon"></i>
            </button>
          </div>

          <button
            class="batch-action-item batch-more-trigger"
            :class="{ active: showBatchMoreMenu }"
            @click="showBatchMoreMenu = !showBatchMoreMenu; if (!showBatchMoreMenu) isEditingBatchPins = false;"
            title="更多批量操作与自定义"
          >
            <i class="fa-solid fa-ellipsis"></i>
            <span v-if="moreBatchActions.length > 0" class="more-count-badge">{{ moreBatchActions.length }}</span>
          </button>
        </div>
      </footer>
    </Transition>

    <!-- 手机端悬浮新建按钮 FAB (在条目和分组模式下可用) -->
    <button
      v-if="!lorebookState.isBatchMode && (lorebookState.activeTab === 'entries' || lorebookState.activeTab === 'groups')"
      class="mobile-fab"
      :disabled="!lorebookState.currentBook"
      @click="addNewEntry"
      title="新建词条"
    >
      <i class="fa-solid fa-plus"></i>
    </button>

    <!-- 内联弹窗：新建世界书 -->
    <div v-if="showNewBookModal" class="modal-inline-mask" data-tt-mobile-surface="backdrop">
      <div class="modal-box" data-tt-mobile-surface="fullscreen-window">
        <div class="modal-title-bar">
          <div class="modal-title-lead">
            <i class="fa-solid fa-book-bookmark text-accent"></i>
            <span class="modal-title-text">世界书 · 新建</span>
          </div>
          <button class="icon-btn-ghost" @click="showNewBookModal = false">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="modal-input-row">
          <i class="fa-solid fa-folder-plus modal-sub-icon"></i>
          <input
            v-model="newBookName"
            type="text"
            placeholder="输入新世界书名称..."
            class="modal-input"
            @keydown.enter="handleCreateBook"
            autofocus
          />
        </div>
        <div class="modal-btns">
          <button class="icon-btn" @click="showNewBookModal = false" title="取消">
            <i class="fa-solid fa-xmark"></i>
          </button>
          <button class="icon-btn btn-accent" @click="handleCreateBook" title="创建">
            <i class="fa-solid fa-check"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- 内联弹窗：重命名世界书 -->
    <div v-if="showRenameBookModal" class="modal-inline-mask" data-tt-mobile-surface="backdrop">
      <div class="modal-box" data-tt-mobile-surface="fullscreen-window">
        <div class="modal-title-bar">
          <div class="modal-title-lead">
            <i class="fa-solid fa-book-bookmark text-accent"></i>
            <span class="modal-title-text">世界书 · 重命名</span>
          </div>
          <button class="icon-btn-ghost" @click="showRenameBookModal = false">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="modal-input-row">
          <i class="fa-solid fa-pen-to-square modal-sub-icon"></i>
          <input
            v-model="renameBookName"
            type="text"
            placeholder="输入新名称..."
            class="modal-input"
            @keydown.enter="handleRenameBook"
            autofocus
          />
        </div>
        <div class="modal-btns">
          <button class="icon-btn" @click="showRenameBookModal = false" title="取消">
            <i class="fa-solid fa-xmark"></i>
          </button>
          <button class="icon-btn btn-accent" @click="handleRenameBook" title="确定">
            <i class="fa-solid fa-check"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- 内联弹窗：批量修改分组 -->
    <div v-if="showBatchGroupModal" class="modal-inline-mask" data-tt-mobile-surface="backdrop">
      <div class="modal-box" data-tt-mobile-surface="fullscreen-window">
        <div class="modal-title-bar">
          <div class="modal-title-lead">
            <i class="fa-solid fa-book-bookmark text-accent"></i>
            <span class="modal-title-text">世界书 · 移动分组</span>
          </div>
          <button class="icon-btn-ghost" @click="showBatchGroupModal = false">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="modal-group-select-section">
          <!-- 快捷选择已有分组下拉框 -->
          <div class="modal-field-block">
            <span class="modal-field-label">移动至现有分组：</span>
            <div class="modal-select-row">
              <i class="fa-solid fa-list-check modal-sub-icon"></i>
              <select v-model="batchGroupName" class="modal-select-field">
                <option value="">(移出当前分组 / 未分组)</option>
                <option v-for="g in entryGroups" :key="g.name" :value="g.name">
                  {{ g.name }} ({{ g.totalCount }}条)
                </option>
              </select>
            </div>
          </div>

          <!-- 快速点击分组胶囊 -->
          <div class="modal-group-chips">
            <button
              type="button"
              class="modal-group-chip"
              :class="{ active: batchGroupName === '' }"
              @click="batchGroupName = ''"
            >
              未分组
            </button>
            <button
              v-for="g in entryGroups"
              :key="g.name"
              type="button"
              class="modal-group-chip"
              :class="{ active: batchGroupName === g.name }"
              @click="batchGroupName = g.name"
            >
              {{ g.name }}
            </button>
          </div>

          <!-- 或输入/新建分组名称 -->
          <div class="modal-field-block">
            <span class="modal-field-label">或输入新分组名称：</span>
            <div class="modal-input-row">
              <i class="fa-solid fa-folder modal-sub-icon"></i>
              <input
                v-model="batchGroupName"
                type="text"
                placeholder="输入分组名称 (留空为未分组)..."
                class="modal-input"
                @keydown.enter="handleExecuteBatchGroup"
              />
            </div>
          </div>
        </div>
        <div class="modal-btns">
          <button class="icon-btn" @click="showBatchGroupModal = false" title="取消">
            <i class="fa-solid fa-xmark"></i>
          </button>
          <button class="icon-btn btn-accent" @click="handleExecuteBatchGroup" title="确定">
            <i class="fa-solid fa-check"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- 内联弹窗：批量导入 JSON -->
    <div v-if="showImportModal" class="modal-inline-mask" data-tt-mobile-surface="backdrop">
      <div class="modal-box import-modal-box" data-tt-mobile-surface="fullscreen-window">
        <div class="modal-title-bar">
          <div class="modal-title-lead">
            <i class="fa-solid fa-book-bookmark text-accent"></i>
            <span class="modal-title-text">世界书 · 批量导入</span>
          </div>
          <button class="icon-btn-ghost" @click="showImportModal = false">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <textarea
          v-model="importJsonText"
          placeholder="粘贴世界书 JSON 数据内容，或从文件导入..."
          class="import-textarea"
        ></textarea>
        <div class="import-actions-row">
          <input
            ref="fileInputRef"
            type="file"
            accept=".json"
            style="display: none"
            @change="handleFileInput"
          />
          <button class="pill-btn" @click="fileInputRef?.click()">
            <i class="fa-solid fa-folder-open"></i>
            <span>选择文件</span>
          </button>
          <div class="right-btns">
            <button class="icon-btn" @click="showImportModal = false" title="取消">
              <i class="fa-solid fa-xmark"></i>
            </button>
            <button class="icon-btn btn-accent" @click="handlePasteImport" title="导入">
              <i class="fa-solid fa-check"></i>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 内联弹窗：操作日志与撤回 (近20条记录) -->
    <div v-if="showHistoryModal" class="modal-inline-mask" data-tt-mobile-surface="backdrop">
      <div class="modal-box history-modal-box" data-tt-mobile-surface="fullscreen-window">
        <div class="modal-title-bar">
          <div class="modal-title-lead">
            <i class="fa-solid fa-clock-rotate-left text-accent"></i>
            <span class="modal-title-text">世界书 · 操作日志 (近20条)</span>
          </div>
          <button class="icon-btn-ghost" @click="showHistoryModal = false">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="history-list-scroll">
          <div v-if="historyList.length === 0" class="history-empty">
            <i class="fa-regular fa-clock"></i>
            <span>暂无最近操作记录</span>
          </div>
          <div
            v-for="item in historyList"
            :key="item.id"
            class="history-item-row"
            :class="{ undone: item.undone }"
          >
            <div class="history-item-main">
              <span class="history-item-time">{{ item.time }}</span>
              <span class="history-item-desc">{{ item.desc }}</span>
            </div>
            <button
              class="history-undo-btn"
              :disabled="item.undone"
              @click="undoAction(item.id)"
              :title="item.undone ? '已撤回' : '撤回此操作'"
            >
              <i class="fa-solid fa-rotate-left"></i>
              <span>{{ item.undone ? '已撤回' : '撤回' }}</span>
            </button>
          </div>
        </div>

        <div class="modal-btns">
          <button
            v-if="historyList.length"
            class="mini-tool-btn text-danger"
            @click="clearHistory"
            title="清空所有操作日志"
          >
            <i class="fa-solid fa-trash-can"></i>
            <span>清空记录</span>
          </button>
          <button class="icon-btn" @click="showHistoryModal = false" title="关闭">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- 内联弹窗：批量管理世界书 (批量删除与批量导入) -->
    <div v-if="showBatchBookModal" class="modal-inline-mask" data-tt-mobile-surface="backdrop">
      <div class="modal-box batch-book-modal-box" data-tt-mobile-surface="fullscreen-window">
        <div class="modal-title-bar">
          <div class="modal-title-lead">
            <i class="fa-solid fa-boxes-stacked text-accent"></i>
            <span class="modal-title-text">世界书 · 批量管理</span>
          </div>
          <button class="icon-btn-ghost" @click="showBatchBookModal = false">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- 标签切换 (批量删除 / 批量导入) -->
        <div class="batch-book-tabs">
          <button
            type="button"
            class="batch-book-tab-btn"
            :class="{ active: batchBookTab === 'delete' }"
            @click="batchBookTab = 'delete'"
          >
            <i class="fa-solid fa-trash-can"></i>
            <span>批量删除</span>
          </button>
          <button
            type="button"
            class="batch-book-tab-btn"
            :class="{ active: batchBookTab === 'import' }"
            @click="batchBookTab = 'import'"
          >
            <i class="fa-solid fa-file-import"></i>
            <span>批量导入</span>
          </button>
        </div>

        <!-- 批量删除面板 -->
        <div v-if="batchBookTab === 'delete'" class="batch-delete-body">
          <div class="batch-book-tools">
            <button type="button" class="mini-tool-btn" @click="selectAllBooks">全选</button>
            <button type="button" class="mini-tool-btn" @click="invertSelectBooks">反选</button>
            <button type="button" class="mini-tool-btn" @click="selectedBookNames = []">清空</button>
            <span class="batch-selected-count">已选 {{ selectedBookNames.length }} / {{ lorebookState.books.length }} 本</span>
          </div>
          <div class="batch-books-scroll">
            <label
              v-for="b in lorebookState.books"
              :key="b"
              class="batch-book-item"
              :class="{ selected: selectedBookNames.includes(b) }"
            >
              <input type="checkbox" :value="b" v-model="selectedBookNames" class="batch-checkbox" />
              <i class="fa-solid fa-book-bookmark"></i>
              <span class="batch-book-name">{{ b }}</span>
            </label>
          </div>
          <div class="batch-delete-confirm-box" v-if="selectedBookNames.length">
            <button
              type="button"
              class="batch-danger-execute-btn"
              :disabled="isBatchDeleting"
              @click="handleExecuteBatchDeleteBooks"
            >
              <i class="fa-solid" :class="isBatchDeleting ? 'fa-spinner fa-spin' : 'fa-trash-can'"></i>
              <span>{{ isBatchDeleting ? '正在删除中...' : `确认删除选中的 ${selectedBookNames.length} 本世界书` }}</span>
            </button>
          </div>
        </div>

        <!-- 批量导入面板 -->
        <div v-else class="batch-import-body">
          <input
            type="file"
            ref="batchFileInput"
            multiple
            accept=".json"
            style="display: none;"
            @change="handleBatchFileSelect"
          />
          <div
            class="import-dropzone"
            :class="{ 'dropzone-active': isDraggingDropzone }"
            @click="triggerBatchFilePicker"
            @dragover.prevent="isDraggingDropzone = true"
            @dragleave.prevent="isDraggingDropzone = false"
            @drop.prevent="handleBatchFileDrop"
          >
            <i class="fa-solid fa-cloud-arrow-up drop-icon"></i>
            <span class="drop-text">点击或拖入多个世界书 JSON 文件</span>
            <span class="drop-subtext">支持单次选择多份 .json 文件批量导入</span>
          </div>

          <div v-if="batchImportFilesList.length" class="batch-file-preview-list">
            <div class="preview-head">
              <span>待导入文件 ({{ batchImportFilesList.length }})：</span>
              <button type="button" class="mini-tool-btn text-xs" :disabled="isBatchImporting" @click="batchImportFilesList = []">清除</button>
            </div>
            <div class="file-names-scroll">
              <div v-for="(f, i) in batchImportFilesList" :key="i" class="file-preview-row">
                <i class="fa-solid fa-file-code"></i>
                <span class="preview-filename">{{ f.name }}</span>
                <span class="preview-filesize">({{ (f.size / 1024).toFixed(1) }} KB)</span>
              </div>
            </div>
            <button
              type="button"
              class="batch-execute-import-btn"
              :disabled="isBatchImporting"
              @click="handleExecuteBatchImport"
            >
              <i class="fa-solid" :class="isBatchImporting ? 'fa-spinner fa-spin' : 'fa-file-import'"></i>
              <span>{{ isBatchImporting ? '正在批量导入中...' : `开始批量导入 (${batchImportFilesList.length} 个文件)` }}</span>
            </button>
          </div>
        </div>

        <div class="modal-btns">
          <button class="icon-btn" @click="showBatchBookModal = false" title="关闭">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- 内联弹窗：保存当前状态为快照 -->
    <div v-if="showCreateSnapshotModal" class="modal-inline-mask" data-tt-mobile-surface="backdrop">
      <div class="modal-box" data-tt-mobile-surface="fullscreen-window">
        <div class="modal-title-bar">
          <div class="modal-title-lead">
            <i class="fa-solid fa-book-bookmark text-accent"></i>
            <span class="modal-title-text">世界书 · 保存快照</span>
          </div>
          <button class="icon-btn-ghost" @click="showCreateSnapshotModal = false">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="modal-input-row">
          <i class="fa-solid fa-camera-retro modal-sub-icon"></i>
          <input
            v-model="newSnapshotName"
            type="text"
            placeholder="输入快照名称 (例如: 战斗中 / 日常)..."
            class="modal-input"
            @keydown.enter="handleTakeSnapshot"
            autofocus
          />
        </div>
        <div class="modal-btns">
          <button class="icon-btn" @click="showCreateSnapshotModal = false" title="取消">
            <i class="fa-solid fa-xmark"></i>
          </button>
          <button class="icon-btn btn-accent" @click="handleTakeSnapshot" title="保存">
            <i class="fa-solid fa-check"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- 内联弹窗：快照对比详情 -->
    <div v-if="showDiffModal && activeDiffSnapshot" class="modal-inline-mask" data-tt-mobile-surface="backdrop">
      <div class="modal-box diff-modal-box" data-tt-mobile-surface="fullscreen-window">
        <div class="diff-head-row">
          <div class="diff-head-title">
            <i class="fa-solid fa-book-bookmark text-accent"></i>
            <span>世界书 · 快照对比 ({{ activeDiffSnapshot.name }})</span>
          </div>
          <button class="icon-btn-ghost" @click="showDiffModal = false">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="diff-content-scroll" v-if="activeSnapshotDiff">
          <div v-if="activeSnapshotDiff.identical" class="diff-identical-notice">
            <i class="fa-solid fa-circle-check text-green"></i>
            <span>当前所有条目开启/停用状态与快照完全一致</span>
          </div>

          <div v-else class="diff-sections-list">
            <!-- 即将启用的条目 -->
            <div v-if="activeSnapshotDiff.toEnable.length > 0" class="diff-group">
              <div class="diff-group-title text-green">
                <i class="fa-solid fa-circle-plus"></i>
                <span>应用后将开启 ({{ activeSnapshotDiff.toEnable.length }})</span>
              </div>
              <div class="diff-items-list">
                <div v-for="uid in activeSnapshotDiff.toEnable" :key="uid" class="diff-item">
                  <span class="diff-item-uid">#{{ uid }}</span>
                  <span class="diff-item-name">{{ lorebookState.bookData?.entries[uid]?.comment || '---' }}</span>
                </div>
              </div>
            </div>

            <!-- 即将停用的条目 -->
            <div v-if="activeSnapshotDiff.toDisable.length > 0" class="diff-group">
              <div class="diff-group-title text-muted">
                <i class="fa-solid fa-circle-minus"></i>
                <span>应用后将停用 ({{ activeSnapshotDiff.toDisable.length }})</span>
              </div>
              <div class="diff-items-list">
                <div v-for="uid in activeSnapshotDiff.toDisable" :key="uid" class="diff-item">
                  <span class="diff-item-uid">#{{ uid }}</span>
                  <span class="diff-item-name">{{ lorebookState.bookData?.entries[uid]?.comment || '---' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-btns">
          <button class="icon-btn" @click="showDiffModal = false" title="关闭">
            <i class="fa-solid fa-xmark"></i>
          </button>
          <button
            class="icon-btn btn-accent"
            @click="applyFromDiff"
            title="应用快照"
          >
            <i class="fa-solid fa-play"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- 内联弹窗：确认覆盖快照 (统一内联风格，标题为世界书，居中优雅展示) -->
    <div v-if="showOverwriteSnapshotModal" class="modal-inline-mask" data-tt-mobile-surface="backdrop">
      <div class="modal-box" data-tt-mobile-surface="fullscreen-window">
        <div class="modal-title-bar">
          <div class="modal-title-lead">
            <i class="fa-solid fa-book-bookmark text-accent"></i>
            <span class="modal-title-text">世界书 · 覆盖快照</span>
          </div>
          <button class="icon-btn-ghost" @click="showOverwriteSnapshotModal = false; snapshotToOverwrite = null">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <p class="modal-confirm-msg">确定要用当前条目的开启/停用状态覆盖此快照吗？</p>
        <div class="modal-btns">
          <button class="icon-btn" @click="showOverwriteSnapshotModal = false; snapshotToOverwrite = null" title="取消">
            <i class="fa-solid fa-xmark"></i>
          </button>
          <button class="icon-btn btn-accent" @click="handleExecuteOverwrite" title="确认覆盖">
            <i class="fa-solid fa-check"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- 内联弹窗：确认删除当前世界书 -->
    <div v-if="showDeleteBookModal" class="modal-inline-mask" data-tt-mobile-surface="backdrop">
      <div class="modal-box" data-tt-mobile-surface="fullscreen-window">
        <div class="modal-title-bar">
          <div class="modal-title-lead">
            <i class="fa-solid fa-book-bookmark text-accent"></i>
            <span class="modal-title-text">世界书 · 删除世界书</span>
          </div>
          <button class="icon-btn-ghost" @click="showDeleteBookModal = false">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <p class="modal-confirm-msg">确定要彻底删除世界书《{{ lorebookState.currentBook }}》吗？此操作无法撤销。</p>
        <div class="modal-btns">
          <button class="icon-btn" @click="showDeleteBookModal = false" title="取消">
            <i class="fa-solid fa-xmark"></i>
          </button>
          <button class="icon-btn btn-danger-action" @click="showDeleteBookModal = false; deleteCurrentBook()" title="彻底删除">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- 内联弹窗：确认批量删除 -->
    <div v-if="showBatchDeleteModal" class="modal-inline-mask" data-tt-mobile-surface="backdrop">
      <div class="modal-box" data-tt-mobile-surface="fullscreen-window">
        <div class="modal-title-bar">
          <div class="modal-title-lead">
            <i class="fa-solid fa-book-bookmark text-accent"></i>
            <span class="modal-title-text">世界书 · 批量删除</span>
          </div>
          <button class="icon-btn-ghost" @click="showBatchDeleteModal = false">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <p class="modal-confirm-msg">确定要批量删除已选中的 {{ lorebookState.selectedUids.length }} 个条目吗？此操作无法撤销。</p>
        <div class="modal-btns">
          <button class="icon-btn" @click="showBatchDeleteModal = false" title="取消">
            <i class="fa-solid fa-xmark"></i>
          </button>
          <button class="icon-btn btn-danger-action" @click="showBatchDeleteModal = false; batchDelete()" title="批量删除">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- 内联弹窗：批量调整插入顺序 -->
    <div v-if="showBatchOrderModal" class="modal-inline-mask" data-tt-mobile-surface="backdrop">
      <div class="modal-box batch-order-modal-box" data-tt-mobile-surface="fullscreen-window">
        <div class="modal-title-bar">
          <div class="modal-title-lead">
            <i class="fa-solid fa-arrow-down-1-9 text-accent"></i>
            <span class="modal-title-text">世界书 · 批量调整顺序</span>
          </div>
          <button class="icon-btn-ghost" @click="showBatchOrderModal = false">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="batch-order-body">
          <!-- 作用范围切换 -->
          <div class="modal-field-block">
            <span class="modal-field-label">作用范围：</span>
            <div class="batch-order-scope-tabs">
              <button
                type="button"
                class="batch-order-scope-btn"
                :class="{ active: batchOrderScope === 'selected' }"
                :disabled="lorebookState.selectedUids.length === 0"
                @click="setBatchOrderScope('selected')"
              >
                仅已勾选 ({{ lorebookState.selectedUids.length }})
              </button>
              <button
                type="button"
                class="batch-order-scope-btn"
                :class="{ active: batchOrderScope === 'from_start' }"
                @click="setBatchOrderScope('from_start')"
              >
                从起始点向后连续
              </button>
            </div>
          </div>

          <!-- 起始点选择 -->
          <div class="modal-field-block">
            <span class="modal-field-label">起始条目（此条之前的条目保持原顺序）：</span>
            <div class="modal-select-row">
              <i class="fa-solid fa-flag-checkered modal-sub-icon"></i>
              <select
                :value="batchOrderStartUid ?? ''"
                @change="onBatchOrderStartChange"
                class="modal-select-field"
              >
                <option
                  v-for="(entry, idx) in batchOrderCandidateEntries"
                  :key="entry.uid"
                  :value="entry.uid"
                >
                  {{ idx + 1 }}. {{ entry.comment || '---' }} (#{{ entry.order ?? 100 }})
                </option>
              </select>
            </div>
          </div>

          <!-- 起始顺序值与递增步长 -->
          <div class="batch-order-inputs-row">
            <div class="modal-field-block">
              <span class="modal-field-label">起始顺序值：</span>
              <div class="modal-input-row">
                <i class="fa-solid fa-hashtag modal-sub-icon"></i>
                <input
                  v-model.number="batchOrderStartVal"
                  type="number"
                  class="modal-input"
                  placeholder="例如: 100"
                />
              </div>
            </div>

            <div class="modal-field-block">
              <span class="modal-field-label">每条递增步长：</span>
              <div class="modal-input-row">
                <i class="fa-solid fa-arrow-up-right-dots modal-sub-icon"></i>
                <input
                  v-model.number="batchOrderStep"
                  type="number"
                  class="modal-input"
                  placeholder="例如: 1"
                />
              </div>
            </div>
          </div>

          <!-- 快捷步长胶囊 -->
          <div class="modal-group-chips">
            <button
              v-for="item in batchOrderQuickSteps"
              :key="item.value"
              type="button"
              class="modal-group-chip"
              :class="{ active: batchOrderStep === item.value }"
              @click="batchOrderStep = item.value"
            >
              {{ item.label }}
            </button>
          </div>

          <!-- 实时顺序调整预览 -->
          <div class="modal-field-block">
            <span class="modal-field-label">调整预览（共 {{ batchOrderPreviewList.length }} 条）：</span>
            <div class="batch-order-preview-scroll">
              <div
                v-for="(item, idx) in batchOrderPreviewList"
                :key="item.uid"
                class="batch-order-preview-row"
              >
                <span class="preview-seq">{{ idx + 1 }}.</span>
                <span class="preview-entry-title">{{ item.title }}</span>
                <span class="preview-order-diff">
                  <span class="preview-old-order">#{{ item.oldOrder }}</span>
                  <i class="fa-solid fa-arrow-right preview-arrow"></i>
                  <span class="preview-new-order" :class="{ changed: item.oldOrder !== item.newOrder }">#{{ item.newOrder }}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-btns">
          <button class="icon-btn" @click="showBatchOrderModal = false" title="取消">
            <i class="fa-solid fa-xmark"></i>
          </button>
          <button
            class="icon-btn btn-accent"
            :disabled="batchOrderPreviewList.length === 0"
            @click="handleExecuteBatchOrder"
            title="应用顺序调整"
          >
            <i class="fa-solid fa-check"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- 内联弹窗：批量修改插入位置与深度 -->
    <div v-if="showBatchPosModal" class="modal-inline-mask" data-tt-mobile-surface="backdrop">
      <div class="modal-box batch-order-modal-box" data-tt-mobile-surface="fullscreen-window">
        <div class="modal-title-bar">
          <div class="modal-title-lead">
            <i class="fa-solid fa-location-dot text-accent"></i>
            <span class="modal-title-text">世界书 · 批量位置与深度</span>
          </div>
          <button class="icon-btn-ghost" @click="showBatchPosModal = false">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="batch-order-body">
          <div class="modal-field-block">
            <span class="modal-field-label">目标插入位置（已选 {{ batchPosSelectedEntries.length }} 条）：</span>
            <div class="modal-select-row">
              <i class="fa-solid fa-location-dot modal-sub-icon"></i>
              <select v-model="batchPosKey" class="modal-select-field">
                <option
                  v-for="opt in batchPositionOptions"
                  :key="`${opt.pos}_${opt.role}`"
                  :value="`${opt.pos}_${opt.role}`"
                >
                  {{ opt.label }}
                </option>
              </select>
            </div>
          </div>

          <!-- 深度配置（仅当目标位置为 D系统 / D用户 / Dai 时显示） -->
          <template v-if="batchPosIsDepthMode">
            <div class="modal-field-block">
              <span class="modal-field-label">深度设置方式：</span>
              <div class="batch-order-scope-tabs">
                <button
                  type="button"
                  class="batch-order-scope-btn"
                  :class="{ active: batchDepthMode === 'fixed' }"
                  @click="batchDepthMode = 'fixed'"
                >
                  统一深度
                </button>
                <button
                  type="button"
                  class="batch-order-scope-btn"
                  :class="{ active: batchDepthMode === 'increment' }"
                  @click="batchDepthMode = 'increment'"
                >
                  递增深度
                </button>
                <button
                  type="button"
                  class="batch-order-scope-btn"
                  :class="{ active: batchDepthMode === 'keep' }"
                  @click="batchDepthMode = 'keep'"
                >
                  保持原深度
                </button>
              </div>
            </div>

            <div v-if="batchDepthMode === 'fixed'" class="modal-field-block">
              <span class="modal-field-label">统一深度值 (0-100)：</span>
              <div class="modal-input-row">
                <i class="fa-solid fa-layer-group modal-sub-icon"></i>
                <input
                  v-model.number="batchDepthStart"
                  type="number"
                  min="0"
                  max="100"
                  class="modal-input"
                  placeholder="默认 4"
                />
              </div>
            </div>

            <div v-else-if="batchDepthMode === 'increment'" class="batch-order-inputs-row">
              <div class="modal-field-block">
                <span class="modal-field-label">起始深度：</span>
                <div class="modal-input-row">
                  <i class="fa-solid fa-layer-group modal-sub-icon"></i>
                  <input
                    v-model.number="batchDepthStart"
                    type="number"
                    min="0"
                    max="100"
                    class="modal-input"
                  />
                </div>
              </div>
              <div class="modal-field-block">
                <span class="modal-field-label">每条步长：</span>
                <div class="modal-input-row">
                  <i class="fa-solid fa-arrow-up-right-dots modal-sub-icon"></i>
                  <input
                    v-model.number="batchDepthStep"
                    type="number"
                    class="modal-input"
                  />
                </div>
              </div>
            </div>
          </template>

          <!-- 调整预览 -->
          <div class="modal-field-block">
            <span class="modal-field-label">修改预览（共 {{ batchPosPreviewList.length }} 条）：</span>
            <div class="batch-order-preview-scroll">
              <div
                v-for="(item, idx) in batchPosPreviewList"
                :key="item.uid"
                class="batch-order-preview-row"
              >
                <span class="preview-seq">{{ idx + 1 }}.</span>
                <span class="preview-entry-title">{{ item.title }}</span>
                <span class="preview-order-diff">
                  <span class="preview-old-order">{{ item.oldLabel }}</span>
                  <i class="fa-solid fa-arrow-right preview-arrow"></i>
                  <span class="preview-new-order" :class="{ changed: item.changed }">{{ item.newLabel }}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-btns">
          <button class="icon-btn" @click="showBatchPosModal = false" title="取消">
            <i class="fa-solid fa-xmark"></i>
          </button>
          <button
            class="icon-btn btn-accent"
            :disabled="batchPosPreviewList.length === 0"
            @click="handleExecuteBatchPos"
            title="应用位置与深度调整"
          >
            <i class="fa-solid fa-check"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- 内联弹窗：跨世界书批量复制 / 移动条目 -->
    <div v-if="showBatchTransferModal" class="modal-inline-mask" data-tt-mobile-surface="backdrop">
      <div class="modal-box batch-order-modal-box" data-tt-mobile-surface="fullscreen-window">
        <div class="modal-title-bar">
          <div class="modal-title-lead">
            <i class="fa-solid fa-share-from-square text-accent"></i>
            <span class="modal-title-text">世界书 · 跨书复制 / 移动</span>
          </div>
          <button class="icon-btn-ghost" @click="showBatchTransferModal = false">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="batch-order-body">
          <div class="modal-field-block">
            <span class="modal-field-label">操作方式（已选 {{ lorebookState.selectedUids.length }} 条）：</span>
            <div class="batch-order-scope-tabs">
              <button
                type="button"
                class="batch-order-scope-btn"
                :class="{ active: batchTransferMode === 'copy' }"
                @click="batchTransferMode = 'copy'"
              >
                复制到目标书
              </button>
              <button
                type="button"
                class="batch-order-scope-btn"
                :class="{ active: batchTransferMode === 'move' }"
                @click="batchTransferMode = 'move'"
              >
                移动到目标书
              </button>
            </div>
          </div>

          <div class="modal-field-block">
            <span class="modal-field-label">目标世界书：</span>
            <div class="modal-select-row">
              <i class="fa-solid fa-book-bookmark modal-sub-icon"></i>
              <select v-model="batchTransferTargetBook" class="modal-select-field">
                <option
                  v-for="b in availableTransferTargetBooks"
                  :key="b"
                  :value="b"
                >
                  {{ b }}
                </option>
              </select>
            </div>
          </div>

          <div class="modal-field-block">
            <span class="modal-field-label">目标分组处理：</span>
            <div class="batch-order-scope-tabs">
              <button
                type="button"
                class="batch-order-scope-btn"
                :class="{ active: batchTransferGroupMode === 'keep' }"
                @click="batchTransferGroupMode = 'keep'"
              >
                保留原分组
              </button>
              <button
                type="button"
                class="batch-order-scope-btn"
                :class="{ active: batchTransferGroupMode === 'custom' }"
                @click="batchTransferGroupMode = 'custom'"
              >
                指定分组
              </button>
            </div>
          </div>

          <div v-if="batchTransferGroupMode === 'custom'" class="modal-field-block">
            <span class="modal-field-label">目标分组名称（留空则为未分组）：</span>
            <div class="modal-input-row">
              <i class="fa-solid fa-folder modal-sub-icon"></i>
              <input
                v-model="batchTransferCustomGroup"
                type="text"
                class="modal-input"
                placeholder="输入目标分组名..."
              />
            </div>
          </div>

          <p class="modal-confirm-msg" v-if="batchTransferMode === 'move'">
            注意：「移动」会从当前世界书《{{ lorebookState.currentBook }}》中移除已选条目并写入目标书（支持在历史日志中撤回）。
          </p>
        </div>

        <div class="modal-btns">
          <button class="icon-btn" @click="showBatchTransferModal = false" title="取消">
            <i class="fa-solid fa-xmark"></i>
          </button>
          <button
            class="icon-btn btn-accent"
            :disabled="!batchTransferTargetBook || isBatchTransferring"
            @click="handleExecuteBatchTransfer"
            title="确认执行"
          >
            <i class="fa-solid" :class="isBatchTransferring ? 'fa-spinner fa-spin' : 'fa-check'"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- 内联弹窗：整本世界书全局查找与批量替换 -->
    <div v-if="showGlobalReplaceModal" class="modal-inline-mask" data-tt-mobile-surface="backdrop">
      <div class="modal-box batch-order-modal-box" data-tt-mobile-surface="fullscreen-window">
        <div class="modal-title-bar">
          <div class="modal-title-lead">
            <i class="fa-solid fa-repeat text-accent"></i>
            <span class="modal-title-text">世界书 · 全局查找与替换</span>
          </div>
          <button class="icon-btn-ghost" @click="showGlobalReplaceModal = false">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="batch-order-body">
          <div class="modal-field-block">
            <span class="modal-field-label">查找范围：</span>
            <div class="batch-order-scope-tabs">
              <button
                type="button"
                class="batch-order-scope-btn"
                :class="{ active: globalReplaceScope === 'all' }"
                @click="globalReplaceScope = 'all'"
              >
                整本世界书
              </button>
              <button
                type="button"
                class="batch-order-scope-btn"
                :class="{ active: globalReplaceScope === 'selected' }"
                :disabled="lorebookState.selectedUids.length === 0"
                @click="globalReplaceScope = 'selected'"
              >
                仅已勾选 ({{ lorebookState.selectedUids.length }})
              </button>
            </div>
          </div>

          <div class="modal-field-block">
            <span class="modal-field-label">查找文本：</span>
            <div class="modal-input-row">
              <i class="fa-solid fa-magnifying-glass modal-sub-icon"></i>
              <input
                v-model="globalSearchText"
                type="text"
                class="modal-input"
                placeholder="输入要查找的词或片段..."
                autofocus
              />
            </div>
          </div>

          <div class="modal-field-block">
            <span class="modal-field-label">替换为：</span>
            <div class="modal-input-row">
              <i class="fa-solid fa-arrow-right-arrow-left modal-sub-icon"></i>
              <input
                v-model="globalReplaceText"
                type="text"
                class="modal-input"
                placeholder="输入替换内容 (留空表示删除匹配文本)..."
              />
            </div>
          </div>

          <div class="modal-field-block">
            <span class="modal-field-label">目标字段与选项：</span>
            <div class="modal-group-chips">
              <button
                type="button"
                class="modal-group-chip"
                :class="{ active: globalReplaceInComment }"
                @click="globalReplaceInComment = !globalReplaceInComment"
              >
                标题
              </button>
              <button
                type="button"
                class="modal-group-chip"
                :class="{ active: globalReplaceInKeys }"
                @click="globalReplaceInKeys = !globalReplaceInKeys"
              >
                触发词
              </button>
              <button
                type="button"
                class="modal-group-chip"
                :class="{ active: globalReplaceInContent }"
                @click="globalReplaceInContent = !globalReplaceInContent"
              >
                正文
              </button>
              <button
                type="button"
                class="modal-group-chip"
                :class="{ active: globalReplaceCaseSensitive }"
                @click="globalReplaceCaseSensitive = !globalReplaceCaseSensitive"
              >
                区分大小写
              </button>
            </div>
          </div>

          <div class="modal-field-block" v-if="globalSearchText">
            <span class="modal-field-label">
              命中 {{ globalReplacePreview.totalEntriesMatched }} 个条目，共 {{ globalReplacePreview.totalHits }} 处匹配：
            </span>
            <div v-if="globalReplacePreview.items.length > 0" class="batch-order-preview-scroll">
              <div
                v-for="(item, idx) in globalReplacePreview.items"
                :key="item.uid"
                class="batch-order-preview-row"
              >
                <span class="preview-seq">{{ idx + 1 }}.</span>
                <span class="preview-entry-title">{{ item.title }}</span>
                <span class="preview-match-meta">
                  <span class="preview-fields-tag">{{ item.fields.join('/') }}</span>
                  <span class="preview-hits-count">{{ item.hits }}处</span>
                </span>
              </div>
            </div>
            <div v-else class="replace-empty-hint">未匹配到任何条目</div>
          </div>
        </div>

        <div class="modal-btns">
          <button class="icon-btn" @click="showGlobalReplaceModal = false" title="取消">
            <i class="fa-solid fa-xmark"></i>
          </button>
          <button
            class="icon-btn btn-accent"
            :disabled="!globalSearchText || globalReplacePreview.totalHits === 0"
            @click="handleExecuteGlobalReplace"
            title="全部替换"
          >
            <i class="fa-solid fa-check"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- 内联弹窗：确认删除单条词条 -->
    <div v-if="entryToDelete !== null" class="modal-inline-mask" data-tt-mobile-surface="backdrop">
      <div class="modal-box" data-tt-mobile-surface="fullscreen-window">
        <div class="modal-title-bar">
          <div class="modal-title-lead">
            <i class="fa-solid fa-book-bookmark text-accent"></i>
            <span class="modal-title-text">世界书 · 删除词条</span>
          </div>
          <button class="icon-btn-ghost" @click="entryToDelete = null">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <p class="modal-confirm-msg">确定要删除词条 #{{ entryToDelete }} 吗？</p>
        <div class="modal-btns">
          <button class="icon-btn" @click="entryToDelete = null" title="取消">
            <i class="fa-solid fa-xmark"></i>
          </button>
          <button class="icon-btn btn-danger-action" @click="handleExecuteDeleteEntry" title="删除">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.entry-list-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--myext-bg);
  position: relative;
  overflow: hidden;
}

/* 顶栏 */
.book-header {
  padding: 8px 12px;
  background: var(--myext-surface);
  border-bottom: 1px solid var(--myext-line);
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

/* 范围微型滑动胶囊栏 (全部/角色卡/当前会话/全局) */
.book-scope-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 2px;
}

.book-scope-bar::-webkit-scrollbar {
  display: none;
}

.scope-chip {
  border: 1px solid var(--myext-line);
  background: var(--myext-surface-2);
  color: var(--myext-ink-soft);
  padding: 3px 9px;
  border-radius: 12px;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.scope-chip.active {
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  border-color: var(--myext-accent);
}

.chip-count {
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.2);
}

/* 书库选择行 */
.book-selector-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
}

.book-selector-row > .icon-btn,
.book-selector-row > .book-tools-dropdown-wrapper {
  flex-shrink: 0;
}

.select-wrapper {
  position: relative;
  flex: 1 1 0%;
  min-width: 0;
  display: flex;
  align-items: center;
}

.book-icon {
  position: absolute;
  left: 10px;
  font-size: 13px;
  color: var(--myext-accent);
  pointer-events: none;
}

.book-select {
  width: 100%;
  min-width: 0;
  height: 36px;
  padding-left: 32px;
  padding-right: 24px;
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius-sm);
  background: var(--myext-surface-2);
  color: var(--myext-ink);
  font-size: 13px;
  font-weight: 500;
  outline: none;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.book-select:focus {
  border-color: var(--myext-accent);
}

/* 世界书更多操作下拉菜单 */
.book-tools-dropdown-wrapper {
  position: relative;
}

.book-tools-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: transparent;
}

.book-tools-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 101;
  min-width: 175px;
  background: var(--myext-surface);
  border: 1px solid var(--myext-line-strong);
  border-radius: var(--myext-radius-sm);
  box-shadow: var(--myext-shadow);
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.book-tools-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: var(--myext-ink);
  font-size: 13px;
  border-radius: calc(var(--myext-radius-sm) - 2px);
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease;
  white-space: nowrap;
}

.book-tools-menu-item i {
  font-size: 13px;
  width: 16px;
  text-align: center;
  color: var(--myext-ink-soft);
}

.book-tools-menu-item:hover,
.book-tools-menu-item:active {
  background: var(--myext-surface-2);
}

.book-tools-menu-item.danger {
  color: var(--myext-danger, #e06c75);
}

.book-tools-menu-item.danger i {
  color: var(--myext-danger, #e06c75);
}

.book-tools-menu-item.danger:hover,
.book-tools-menu-item.danger:active {
  background: rgba(224, 108, 117, 0.12);
}

.book-tools-menu-divider {
  height: 1px;
  background: var(--myext-line);
  margin: 4px 2px;
}

/* 核心四大功能视图切换栏 */
.view-tabs-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  border-bottom: 1px solid var(--myext-line);
  padding-bottom: 6px;
}

.view-tab-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 6px 4px;
  border: none;
  background: none;
  color: var(--myext-ink-soft);
  font-size: 12px;
  font-weight: 500;
  border-radius: var(--myext-radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;
}

.view-tab-btn.active {
  background: var(--myext-surface-2);
  color: var(--myext-accent);
  font-weight: 600;
}

.tab-count-pill {
  font-size: 9px;
  padding: 0 4px;
  border-radius: 6px;
  background: var(--myext-line);
  color: var(--myext-ink-muted);
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
  color: var(--myext-ink);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s;
  flex-shrink: 0;
}

.icon-btn.active {
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  border-color: var(--myext-accent);
}

.icon-btn:hover,
.icon-btn:active {
  background: var(--myext-surface);
  color: var(--myext-accent);
  border-color: var(--myext-accent);
}

.danger-icon:hover,
.danger-icon:active {
  color: #fa5252;
  border-color: #ffa8a8;
}

.btn-accent {
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  border-color: var(--myext-accent);
}

.spinning i {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 搜索与筛选行 */
.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-box {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 10px;
  font-size: 12px;
  color: var(--myext-ink-muted);
}

.search-input {
  width: 100%;
  height: 36px;
  padding-left: 30px;
  padding-right: 52px;
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius-sm);
  background: var(--myext-surface-2);
  color: var(--myext-ink);
  font-size: 13px;
  outline: none;
}

.search-input:focus {
  border-color: var(--myext-accent);
}

.search-right-tools {
  position: absolute;
  right: 6px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.search-inline-btn {
  background: none;
  border: none;
  color: var(--myext-ink-muted);
  cursor: pointer;
  padding: 4px;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.search-inline-btn:hover,
.search-inline-btn:active {
  color: var(--myext-accent);
}

.sort-wrapper,
.filter-wrapper {
  flex-shrink: 0;
}

.sort-select,
.filter-select {
  height: 36px;
  padding: 0 8px;
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius-sm);
  background: var(--myext-surface-2);
  color: var(--myext-ink);
  font-size: 12px;
  outline: none;
  cursor: pointer;
}

.sort-select:focus,
.filter-select:focus {
  border-color: var(--myext-accent);
}

/* 主内容滚动流 */
.entries-scroll-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 12px 90px;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain;
  transform: translateZ(0);
}

.entries-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.entry-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: var(--myext-surface);
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius);
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
  contain: layout style paint;
}

@media (hover: hover) {
  .entry-card:active {
    background: var(--myext-surface-2);
    transform: scale(0.99);
  }
}

.entry-card.disabled {
  opacity: 0.65;
}

.entry-card.selected {
  border-color: var(--myext-accent);
  background: var(--myext-surface-2);
}

.card-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.card-row-lead {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.batch-check-btn {
  background: none;
  border: none;
  padding: 0;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.entry-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--myext-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-quick-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.card-status-toggle-btn {
  background: var(--myext-surface-2);
  border: 1px solid var(--myext-line);
  padding: 5px 7px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s ease;
  touch-action: manipulation;
}

.card-status-toggle-btn:active {
  background: var(--myext-surface);
  border-color: var(--myext-accent);
  transform: scale(0.94);
}

.status-indicator-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
  transition: all 0.2s ease;
}

.dot-blue {
  background: #6b8ca8;
  box-shadow: 0 0 6px rgba(107, 140, 168, 0.5);
}

.dot-green {
  background: #6e9681;
  box-shadow: 0 0 6px rgba(110, 150, 129, 0.5);
}

.dot-purple {
  background: #95819e;
  box-shadow: 0 0 6px rgba(149, 129, 158, 0.5);
}

.dot-gray {
  background: #828a93;
  opacity: 0.6;
  box-shadow: none;
}

/* 第二行小字元信息 */
.card-row-sub {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  padding-left: 2px;
}

.card-meta-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}

.strategy-pill-dropdown {
  border: 1px solid transparent;
  background: none;
  padding: 1px 5px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
  position: relative;
  cursor: pointer;
  transition: none !important;
  transform: none !important;
  touch-action: manipulation;
}

.strategy-pill-dropdown:active,
.strategy-pill-dropdown:focus,
.strategy-pill-dropdown:focus-within {
  transform: none !important;
  transition: none !important;
}

.entry-card:has(.strategy-pill-dropdown:active),
.entry-card:has(.strategy-pill-dropdown:focus-within) {
  transform: none !important;
}

.strategy-select {
  border: none;
  background: transparent;
  color: inherit;
  font-size: 11px;
  font-weight: 500;
  outline: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
}

.strategy-select option {
  background: var(--myext-surface);
  color: var(--myext-ink);
  font-size: 12px;
}

.pill-dropdown-arrow {
  font-size: 9px;
  opacity: 0.65;
  pointer-events: none;
  margin-left: 1px;
}

.pill-lamp-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.pill-green {
  background: rgba(110, 150, 129, 0.14);
  color: #8ebd9e;
  border-color: rgba(110, 150, 129, 0.3);
}
.pill-green .pill-lamp-dot {
  background: #6e9681;
  box-shadow: 0 0 5px rgba(110, 150, 129, 0.7);
}

.pill-blue {
  background: rgba(107, 140, 168, 0.14);
  color: #8faec7;
  border-color: rgba(107, 140, 168, 0.3);
}
.pill-blue .pill-lamp-dot {
  background: #6b8ca8;
  box-shadow: 0 0 5px rgba(107, 140, 168, 0.7);
}

.pill-purple {
  background: rgba(149, 129, 158, 0.14);
  color: #b7a4c4;
  border-color: rgba(149, 129, 158, 0.3);
}
.pill-purple .pill-lamp-dot {
  background: #95819e;
  box-shadow: 0 0 5px rgba(149, 129, 158, 0.7);
}

.badge-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
}

.tag-gray {
  background: rgba(130, 138, 147, 0.12);
  color: #9ea5ad;
  border: 1px solid rgba(130, 138, 147, 0.22);
}

.tag-group {
  background: rgba(107, 140, 168, 0.1);
  color: #6b8ca8;
  border: 1px solid rgba(107, 140, 168, 0.2);
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.tag-mutex {
  background: rgba(220, 120, 50, 0.12);
  color: #d97736;
  border: 1px solid rgba(220, 120, 50, 0.25);
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.tag-depth {
  background: rgba(147, 130, 158, 0.15);
  color: #b7a4c4;
  border: 1px solid rgba(147, 130, 158, 0.28);
}

.tag-depth-sys {
  background: rgba(107, 140, 168, 0.15);
  color: #82a7c4;
  border: 1px solid rgba(107, 140, 168, 0.3);
}

.tag-depth-user {
  background: rgba(110, 150, 129, 0.15);
  color: #83b499;
  border: 1px solid rgba(110, 150, 129, 0.3);
}

.tag-depth-ai {
  background: rgba(164, 130, 178, 0.16);
  color: #be9dce;
  border: 1px solid rgba(164, 130, 178, 0.32);
}

.tag-pos {
  background: rgba(184, 156, 118, 0.15);
  color: #cbaf88;
  border: 1px solid rgba(184, 156, 118, 0.28);
}

.tag-green {
  background: rgba(110, 150, 129, 0.14);
  color: #6e9681;
  border: 1px solid rgba(110, 150, 129, 0.28);
}

.tag-blue {
  background: rgba(107, 140, 168, 0.14);
  color: #6b8ca8;
  border: 1px solid rgba(107, 140, 168, 0.28);
}

.tag-purple {
  background: rgba(149, 129, 158, 0.14);
  color: #95819e;
  border: 1px solid rgba(149, 129, 158, 0.28);
}

.badge-order {
  font-size: 11px;
  color: var(--myext-ink-muted);
  font-family: var(--myext-font-mono);
}

.badge-token {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--myext-surface-2);
  border: 1px solid var(--myext-line);
  color: var(--myext-ink-muted);
  font-family: var(--myext-font-mono);
  white-space: nowrap;
}

.card-keywords {
  display: flex;
  gap: 4px;
  overflow: hidden;
  flex-shrink: 0;
}

.mini-key-tag {
  font-size: 11px;
  padding: 1px 6px;
  background: var(--myext-surface-2);
  border: 1px solid var(--myext-line);
  border-radius: 4px;
  color: var(--myext-ink-soft);
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mini-key-more {
  font-size: 10px;
  color: var(--myext-ink-muted);
}

.card-act-btn {
  background: none;
  border: none;
  color: var(--myext-ink-soft);
  padding: 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.card-act-btn:active {
  color: var(--myext-accent);
}

.card-del-btn:active {
  color: #fa5252;
}

.chevron-icon {
  font-size: 12px;
  color: var(--myext-ink-muted);
  margin-left: 2px;
}

/* ================= 视图 2：条目分组视图样式 ================= */
.groups-view-container {
  display: flex;
  flex-direction: column;
}

.groups-flow {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.group-section-card {
  background: var(--myext-surface);
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius);
  overflow: hidden;
  contain: layout style;
}

.group-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  cursor: pointer;
  transition: background 0.15s;
}

.group-header-row:active {
  background: var(--myext-surface-2);
}

.group-lead-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.group-chevron {
  font-size: 12px;
  color: var(--myext-ink-muted);
  transition: transform 0.2s ease;
}

.group-chevron.expanded {
  transform: rotate(90deg);
}

.group-title-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--myext-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-actions-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.group-count-pill {
  font-size: 12px;
  font-family: var(--myext-font-mono);
  color: var(--myext-ink-muted);
}

.group-count-pill.count-active {
  color: var(--myext-ink-soft);
  font-weight: 500;
}

/* 组级滑动开关 (iOS 极简圆润开关) */
.group-switch-pill {
  width: 38px;
  height: 22px;
  border-radius: 11px;
  background: var(--myext-line-strong);
  border: none;
  cursor: pointer;
  position: relative;
  transition: background 0.25s ease;
  padding: 2px;
  display: flex;
  align-items: center;
}

.group-switch-pill.on {
  background: var(--myext-accent);
}

.group-switch-pill.half {
  background: #8faec7;
}

.group-switch-knob {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ffffff;
  transition: transform 0.25s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}

.group-switch-pill.on .group-switch-knob {
  transform: translateX(16px);
}

.group-switch-pill.half .group-switch-knob {
  transform: translateX(8px);
}

.group-entries-container {
  padding: 8px 10px 10px;
  background: var(--myext-surface-2);
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-top: 1px solid var(--myext-line);
}

/* ================= 视图 3：快照管理样式 ================= */
.snapshots-view-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.snapshots-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--myext-surface);
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius);
}

.snap-header-lead {
  display: flex;
  align-items: center;
  gap: 8px;
}

.camera-lead-icon {
  font-size: 14px;
  color: var(--myext-accent);
}

.snap-header-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--myext-ink);
}

.snap-header-badge {
  font-size: 11px;
  font-family: var(--myext-font-mono);
  background: var(--myext-surface-2);
  color: var(--myext-ink-soft);
  padding: 1px 6px;
  border-radius: 10px;
  border: 1px solid var(--myext-line);
}

.snapshots-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.snapshot-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--myext-surface);
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius);
  gap: 8px;
}

.snap-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.snap-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.snap-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--myext-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.snap-diff-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--myext-surface-2);
  border: 1px solid var(--myext-line);
  color: var(--myext-ink-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
}

.snap-diff-chip:active {
  background: var(--myext-line);
}

.snap-diff-chip .diff-tag-plus {
  color: #6e9681;
  font-weight: 600;
}

.snap-diff-chip .diff-tag-minus {
  color: #868e96;
  font-weight: 600;
}

.snap-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--myext-ink-muted);
}

.snap-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.snap-icon-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--myext-line);
  background: var(--myext-surface-2);
  color: var(--myext-ink);
  border-radius: var(--myext-radius-sm);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.snap-icon-btn:active {
  transform: scale(0.93);
}

.snap-icon-btn.btn-apply {
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  border-color: var(--myext-accent);
}

.snap-icon-btn.btn-del:active {
  color: #fa5252;
  border-color: #ffa8a8;
}

/* ================= 视图 4：监控与统计样式 ================= */
.monitor-view-container {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.stats-overview-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.stat-metric-card {
  background: var(--myext-surface);
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-label {
  font-size: 11px;
  color: var(--myext-ink-muted);
}

.metric-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.metric-mode-pills {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: var(--myext-surface-2);
  border: 1px solid var(--myext-line);
  border-radius: 4px;
  padding: 1px;
}

.metric-mode-pill {
  border: none;
  background: transparent;
  color: var(--myext-ink-muted);
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  cursor: pointer;
  line-height: 1.3;
}

.metric-mode-pill.active {
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  font-weight: 600;
}

.metric-sub-hint {
  font-size: 10px;
  color: var(--myext-ink-muted);
  font-family: var(--myext-font-mono);
  margin-top: 1px;
}

.metric-value {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.num-highlight {
  font-size: 18px;
  font-weight: 700;
  color: var(--myext-accent);
  font-family: var(--myext-font-mono);
}

.num-sub {
  font-size: 11px;
  color: var(--myext-ink-soft);
}

.metric-sub-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 2px;
}

.activation-monitor-section {
  background: var(--myext-surface);
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.head-lead {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--myext-ink);
}

.monitor-empty-box {
  padding: 30px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--myext-ink-muted);
  font-size: 12px;
  text-align: center;
}

.empty-check-icon {
  font-size: 24px;
}

.activated-entries-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.activated-entry-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: var(--myext-surface-2);
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius-sm);
  cursor: pointer;
  transition: all 0.15s;
}

.activated-entry-card:active {
  border-color: var(--myext-accent);
}

.act-card-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.act-book-tag {
  font-size: 10px;
  padding: 1px 5px;
  background: var(--myext-line);
  border-radius: 4px;
  color: var(--myext-ink-soft);
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.act-entry-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--myext-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.act-card-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* ================= 批量整理浮动栏 ================= */
.batch-floating-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--myext-surface);
  border-top: 1px solid var(--myext-line-strong);
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.2);
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 100;
}

.batch-bar-lead {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.batch-counter-box {
  display: flex;
  align-items: center;
  gap: 6px;
}

.batch-count-text {
  font-size: 12px;
  font-weight: 600;
  color: var(--myext-accent);
}

.tag-range {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(184, 151, 126, 0.2);
  color: var(--myext-accent);
  border: 1px solid var(--myext-accent);
}

.batch-select-shortcuts {
  display: flex;
  align-items: center;
  gap: 6px;
}

.batch-tool-btn {
  width: 28px;
  height: 28px;
  border-radius: var(--myext-radius-sm);
  border: 1px solid var(--myext-line);
  background: var(--myext-surface-2);
  color: var(--myext-ink-soft);
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}

.batch-tool-btn:active {
  transform: scale(0.92);
}

.batch-tool-btn.active {
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  border-color: var(--myext-accent);
}

.batch-actions-scroll {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 2px;
}

.batch-actions-scroll::-webkit-scrollbar {
  display: none;
}

.batch-action-item {
  width: 36px;
  height: 36px;
  border: 1px solid var(--myext-line);
  background: var(--myext-surface-2);
  color: var(--myext-ink);
  border-radius: var(--myext-radius-sm);
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
}

.batch-action-item:active:not(:disabled) {
  transform: scale(0.92);
}

.batch-action-item:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.batch-action-item.danger:not(:disabled) {
  color: #fa5252;
  border-color: #ffa8a8;
}

.batch-action-item.btn-close-batch {
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  border-color: var(--myext-accent);
}

.batch-light-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

/* 状态空箱 */
.state-icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  color: var(--myext-ink-muted);
  font-size: 32px;
}

/* 手机端悬浮操作按钮 (FAB) */
.mobile-fab {
  position: absolute;
  bottom: 20px;
  right: 20px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  border: 1px solid var(--myext-line-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  transition: all 0.15s ease;
  z-index: 50;
}

.mobile-fab:active {
  transform: scale(0.92);
}

.mobile-fab:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 内联弹窗 */
.modal-inline-mask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 200;
}

@media (min-width: 641px) {
  .modal-inline-mask {
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }
}

.modal-box {
  background: var(--myext-surface);
  border: 1px solid var(--myext-line-strong);
  border-radius: var(--myext-radius);
  padding: 14px;
  width: 100%;
  max-width: 340px;
  box-sizing: border-box;
  box-shadow: var(--myext-shadow);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal-head-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.modal-icon {
  font-size: 16px;
  color: var(--myext-accent);
}

.modal-input {
  flex: 1;
  min-width: 0;
  height: 36px;
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius-sm);
  background: var(--myext-surface-2);
  color: var(--myext-ink);
  font-size: 13px;
  padding: 0 10px;
  outline: none;
}

.modal-input:focus {
  border-color: var(--myext-accent);
}

.modal-btns {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* 导入模态框特别样式 */
.import-modal-box {
  max-width: 440px;
}

.import-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--myext-ink);
}

.import-textarea {
  width: 100%;
  height: 140px;
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius-sm);
  background: var(--myext-surface-2);
  color: var(--myext-ink);
  font-size: 12px;
  padding: 8px;
  outline: none;
  resize: vertical;
  font-family: var(--myext-font-mono);
}

.import-actions-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.pill-btn {
  border: 1px solid var(--myext-line);
  background: var(--myext-surface-2);
  color: var(--myext-ink);
  padding: 6px 10px;
  border-radius: var(--myext-radius-sm);
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.right-btns {
  display: flex;
  gap: 8px;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

.text-accent {
  color: var(--myext-accent);
}

.text-muted {
  color: var(--myext-ink-muted);
}

.text-green {
  color: #6e9681;
}

/* 统一样式：模态框标题栏、输入行与确认信息 */
.modal-title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--myext-line);
  padding-bottom: 8px;
}

.modal-title-lead {
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-title-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--myext-ink);
}

.modal-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--myext-surface-2);
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius-sm);
  padding: 0 10px;
}

.modal-sub-icon {
  font-size: 14px;
  color: var(--myext-ink-soft);
  flex-shrink: 0;
}

.modal-input-row .modal-input {
  width: 100%;
  min-width: 0;
  flex: 1 1 0%;
  box-sizing: border-box;
  border: none;
  background: transparent;
  padding: 0;
}

.modal-confirm-msg {
  font-size: 13px;
  color: var(--myext-ink);
  line-height: 1.5;
  margin: 6px 0;
}

.btn-danger-action {
  background: rgba(250, 82, 82, 0.15);
  color: #fa5252;
  border-color: rgba(250, 82, 82, 0.3);
}

.btn-danger-action:active {
  background: #fa5252;
  color: #fff;
}

/* 快照对比模态框 */
.diff-modal-box {
  max-width: 360px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.diff-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.diff-head-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--myext-ink);
}

.diff-content-scroll {
  overflow-y: auto;
  max-height: 52vh;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0;
}

.diff-identical-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--myext-ink-soft);
  padding: 14px 10px;
  background: var(--myext-surface-2);
  border-radius: var(--myext-radius-sm);
}

.diff-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.diff-group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
}

.diff-items-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--myext-surface-2);
  padding: 6px 8px;
  border-radius: var(--myext-radius-sm);
  border: 1px solid var(--myext-line);
}

.diff-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.diff-item-uid {
  font-family: var(--myext-font-mono);
  color: var(--myext-ink-muted);
  font-size: 11px;
}

.diff-item-name {
  color: var(--myext-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 分组移动弹窗样式 */
.modal-group-select-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 10px 0;
  width: 100%;
  box-sizing: border-box;
}

.modal-field-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.modal-field-label {
  font-size: 12px;
  color: var(--myext-ink-soft);
  font-weight: 500;
}

.modal-select-row {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--myext-surface-2);
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius-sm);
  padding: 0 10px;
  width: 100%;
  box-sizing: border-box;
}

.modal-select-field {
  flex: 1 1 0%;
  height: 36px;
  background: transparent;
  border: none;
  color: var(--myext-ink);
  font-size: 13px;
  outline: none;
  min-width: 0;
}

.modal-select-field option {
  background: var(--myext-surface);
  color: var(--myext-ink);
}

.modal-group-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 90px;
  overflow-y: auto;
  padding: 2px 0;
}

.modal-group-chip {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  border: 1px solid var(--myext-line);
  background: var(--myext-surface-2);
  color: var(--myext-ink-soft);
  cursor: pointer;
  transition: all 0.15s;
}

.modal-group-chip.active {
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  border-color: var(--myext-accent);
  font-weight: 600;
}

/* 操作日志与撤回弹窗 */
.history-modal-box {
  max-width: 480px;
  max-height: 75vh;
}

.history-list-scroll {
  max-height: 52vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 10px 0;
}

.history-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--myext-ink-muted);
  padding: 30px 0;
  font-size: 13px;
}

.history-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--myext-radius-sm);
  background: var(--myext-surface-2);
  border: 1px solid var(--myext-line);
}

.history-item-row.undone {
  opacity: 0.5;
  text-decoration: line-through;
}

.history-item-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.history-item-time {
  font-size: 10px;
  color: var(--myext-ink-muted);
  font-family: var(--myext-font-mono);
}

.history-item-desc {
  font-size: 12px;
  color: var(--myext-ink);
  word-break: break-all;
}

.history-undo-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: var(--myext-radius-sm);
  border: 1px solid var(--myext-accent);
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  font-size: 11px;
  cursor: pointer;
  flex-shrink: 0;
}

.history-undo-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  border-color: var(--myext-line);
  background: var(--myext-surface);
  color: var(--myext-ink-muted);
}

/* 批量管理世界书弹窗 */
.batch-book-modal-box {
  max-width: 500px;
  max-height: 80vh;
}

.batch-book-tabs {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--myext-line);
  padding-bottom: 8px;
  margin-bottom: 10px;
}

.batch-book-tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 34px;
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius-sm);
  background: var(--myext-surface-2);
  color: var(--myext-ink-soft);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.batch-book-tab-btn.active {
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  border-color: var(--myext-accent);
  font-weight: 600;
}

.batch-delete-body,
.batch-import-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.batch-book-tools {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mini-tool-btn {
  padding: 3px 8px;
  font-size: 11px;
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius-sm);
  background: var(--myext-surface-2);
  color: var(--myext-ink-soft);
  cursor: pointer;
}

.mini-tool-btn.text-danger {
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.4);
}

.batch-selected-count {
  font-size: 11px;
  color: var(--myext-ink-muted);
  margin-left: auto;
}

.batch-books-scroll {
  max-height: 38vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 2px;
}

.batch-book-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: var(--myext-radius-sm);
  background: var(--myext-surface-2);
  border: 1px solid var(--myext-line);
  cursor: pointer;
  font-size: 12px;
}

.batch-book-item.selected {
  border-color: var(--myext-accent);
  background: rgba(110, 150, 129, 0.1);
}

.batch-checkbox {
  accent-color: var(--myext-accent);
  width: 15px;
  height: 15px;
}

.batch-book-name {
  flex: 1 1 0%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-delete-confirm-box {
  padding-top: 6px;
}

.batch-danger-execute-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  border: none;
  border-radius: var(--myext-radius-sm);
  background: #ef4444;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.import-dropzone {
  border: 2px dashed var(--myext-line);
  border-radius: var(--myext-radius-sm);
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  text-align: center;
  transition: all 0.2s;
}

.import-dropzone:hover,
.import-dropzone.dropzone-active {
  border-color: var(--myext-accent);
  background: rgba(110, 150, 129, 0.08);
}

.drop-icon {
  font-size: 28px;
  color: var(--myext-accent);
}

.drop-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--myext-ink);
}

.drop-subtext {
  font-size: 11px;
  color: var(--myext-ink-muted);
}

.batch-file-preview-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--myext-ink-soft);
  font-weight: 500;
}

.file-names-scroll {
  max-height: 130px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-preview-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 4px 8px;
  background: var(--myext-surface-2);
  border-radius: var(--myext-radius-sm);
  border: 1px solid var(--myext-line);
}

.preview-filename {
  flex: 1 1 0%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-filesize {
  font-size: 11px;
  color: var(--myext-ink-muted);
  font-family: var(--myext-font-mono);
}

.batch-execute-import-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  border: none;
  border-radius: var(--myext-radius-sm);
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 4px;
}

/* ================= 世界书绑定下拉菜单 ================= */
.book-bind-btn {
  position: relative;
}

.menu-bind-badge {
  margin-left: auto;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
  font-family: var(--myext-font-mono);
}

.bind-count-dot {
  position: absolute;
  top: -3px;
  right: -3px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  font-size: 9px;
  font-weight: 700;
  line-height: 14px;
  text-align: center;
  font-family: var(--myext-font-mono);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}

.book-bind-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  width: 100%;
  max-width: 320px;
  margin-left: auto;
  box-sizing: border-box;
  background: var(--myext-surface);
  border: 1px solid var(--myext-line-strong);
  border-radius: var(--myext-radius);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
  padding: 6px;
  z-index: 120;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bind-menu-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--myext-ink-muted);
  border-bottom: 1px solid var(--myext-line);
  margin-bottom: 2px;
}

.bind-menu-bookname {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--myext-ink);
}

.bind-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: var(--myext-radius-sm);
  background: transparent;
  color: var(--myext-ink);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.bind-menu-item:hover:not(:disabled) {
  background: var(--myext-surface-2);
}

.bind-menu-item.active {
  background: rgba(110, 150, 129, 0.1);
  border-color: rgba(110, 150, 129, 0.25);
}

.bind-menu-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.bind-item-lead {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  flex: 1;
}

.bind-item-icon {
  font-size: 13px;
  width: 16px;
  text-align: center;
  color: var(--myext-ink-soft);
  flex-shrink: 0;
}

.bind-menu-item.active .bind-item-icon {
  color: var(--myext-accent);
}

.bind-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.bind-item-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--myext-ink);
  line-height: 1.2;
}

.bind-item-sub {
  font-size: 10px;
  color: var(--myext-ink-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
}

.bind-switch-pill {
  width: 32px;
  height: 18px;
  border-radius: 9px;
  background: var(--myext-line-strong);
  position: relative;
  transition: background 0.2s ease;
  padding: 2px;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.bind-switch-pill.on {
  background: var(--myext-accent);
}

.bind-switch-knob {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ffffff;
  transition: transform 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
}

.bind-switch-pill.on .bind-switch-knob {
  transform: translateX(14px);
}

/* ================= 分组拖拽与排序样式 ================= */
.group-drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 22px;
  color: var(--myext-ink-muted);
  cursor: grab;
  opacity: 0.65;
  flex-shrink: 0;
  touch-action: none;
}

.group-drag-handle:hover,
.group-drag-handle:active {
  color: var(--myext-accent);
  opacity: 1;
}

.group-sort-btns {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.group-move-btn {
  width: 22px;
  height: 22px;
  border: 1px solid var(--myext-line);
  border-radius: 4px;
  background: var(--myext-surface-2);
  color: var(--myext-ink-soft);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  cursor: pointer;
  padding: 0;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.group-move-btn:hover:not(:disabled) {
  color: var(--myext-accent);
  border-color: var(--myext-accent);
}

.group-move-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.group-section-card.group-dragging {
  opacity: 0.55;
  border-style: dashed;
  border-color: var(--myext-accent);
}

.group-section-card.group-drop-before {
  box-shadow: 0 -2px 0 0 var(--myext-accent);
}

.group-section-card.group-drop-after {
  box-shadow: 0 2px 0 0 var(--myext-accent);
}

/* ================= 批量调整顺序弹窗样式 ================= */
.batch-order-modal-box {
  max-width: 400px;
}

.batch-order-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.batch-order-scope-tabs {
  display: flex;
  gap: 6px;
}

.batch-order-scope-btn {
  flex: 1;
  height: 32px;
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius-sm);
  background: var(--myext-surface-2);
  color: var(--myext-ink-soft);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.batch-order-scope-btn.active {
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  border-color: var(--myext-accent);
  font-weight: 600;
}

.batch-order-scope-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.batch-order-inputs-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
}

.batch-order-preview-scroll {
  max-height: 170px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  border-radius: var(--myext-radius-sm);
  background: var(--myext-surface-2);
  border: 1px solid var(--myext-line);
}

.batch-order-preview-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  padding: 2px 0;
}

.preview-seq {
  color: var(--myext-ink-muted);
  font-family: var(--myext-font-mono);
  flex-shrink: 0;
}

.preview-entry-title {
  flex: 1;
  min-width: 0;
  color: var(--myext-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-order-diff {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--myext-font-mono);
  flex-shrink: 0;
}

.preview-old-order {
  color: var(--myext-ink-muted);
}

.preview-arrow {
  font-size: 9px;
  color: var(--myext-ink-muted);
}

.preview-new-order {
  color: var(--myext-ink-soft);
  font-weight: 600;
}

.preview-new-order.changed {
  color: var(--myext-accent);
}

.group-batch-check-btn {
  margin-right: 2px;
}

.preview-match-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.preview-fields-tag {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--myext-surface);
  border: 1px solid var(--myext-line);
  color: var(--myext-ink-soft);
}

.preview-hits-count {
  font-family: var(--myext-font-mono);
  color: var(--myext-accent);
  font-weight: 600;
}

.replace-empty-hint {
  padding: 10px;
  text-align: center;
  font-size: 12px;
  color: var(--myext-ink-muted);
  background: var(--myext-surface-2);
  border-radius: var(--myext-radius-sm);
  border: 1px solid var(--myext-line);
}

/* ================= 批量底栏固定退出 + 更多宫格抽屉 ================= */
.batch-tool-btn.btn-exit-batch {
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  border-color: var(--myext-accent);
}

.batch-actions-bar-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.batch-actions-bar-wrap .batch-actions-scroll {
  flex: 1 1 0%;
  min-width: 0;
}

.batch-more-trigger {
  position: relative;
  flex-shrink: 0;
}

.batch-more-trigger.active {
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  border-color: var(--myext-accent);
}

.more-count-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 15px;
  height: 15px;
  padding: 0 3px;
  border-radius: 8px;
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  font-size: 9px;
  font-weight: 700;
  line-height: 15px;
  text-align: center;
  font-family: var(--myext-font-mono);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}

.batch-more-backdrop {
  position: fixed;
  inset: 0;
  z-index: 98;
  background: transparent;
}

.batch-more-popover {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 12px;
  left: 12px;
  max-width: 380px;
  margin-left: auto;
  background: var(--myext-surface);
  border: 1px solid var(--myext-line-strong);
  border-radius: var(--myext-radius);
  box-shadow: 0 -6px 24px rgba(0, 0, 0, 0.24);
  padding: 10px 12px 12px;
  z-index: 110;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.batch-more-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid var(--myext-line);
  padding-bottom: 6px;
}

.batch-more-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--myext-ink);
}

.batch-more-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-pin-done {
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  border-color: var(--myext-accent);
  font-weight: 600;
}

.batch-pin-tip {
  margin: 0;
  font-size: 11px;
  color: var(--myext-ink-muted);
}

.batch-more-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.batch-more-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 9px 4px;
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius-sm);
  background: var(--myext-surface-2);
  color: var(--myext-ink);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.batch-more-cell:active:not(:disabled) {
  transform: scale(0.95);
  border-color: var(--myext-accent);
}

.batch-more-cell:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.batch-more-cell.danger:not(:disabled) {
  color: #fa5252;
  border-color: rgba(250, 82, 82, 0.35);
}

.batch-more-cell.pinned {
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  border-color: var(--myext-accent);
}

.batch-more-cell.pinned .batch-light-dot {
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.55);
}

.batch-more-cell-label {
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
}

.batch-more-empty {
  padding: 12px 8px;
  text-align: center;
  font-size: 12px;
  color: var(--myext-ink-muted);
}

.more-pop-enter-active,
.more-pop-leave-active {
  transition: transform 0.18s ease, opacity 0.18s ease;
}

.more-pop-enter-from,
.more-pop-leave-to {
  transform: translateY(8px) scale(0.97);
  opacity: 0;
}
</style>
