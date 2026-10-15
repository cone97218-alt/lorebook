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
  batchDelete,
  batchSetGroup,
  batchExportJson,
  batchImportJson,
  batchDeleteBooks,
  batchImportBooks,
  checkLastActivation,
  type WorldBookSnapshot,
  type SnapshotDiff,
  type WorldBookTab,
  type BookScopeFilter,
} from '@/state/lorebook';
import { ui } from '@/state/ui';
import { toast } from '@/st/toast';
import { historyList, undoAction, clearHistory } from '@/state/history';

const showNewBookModal = ref(false);
const newBookName = ref('');
const showRenameBookModal = ref(false);
const renameBookName = ref('');
const showDeleteBookModal = ref(false);
const entryToDelete = ref<number | null>(null);

const showBatchDeleteModal = ref(false);
const showBatchGroupModal = ref(false);
const batchGroupName = ref('');
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

function onScroll(e: Event) {
  const el = e.target as HTMLElement;
  lorebookState.savedScrollTop = el.scrollTop;
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
      if (target?.closest('.book-scope-bar, .batch-actions-scroll, .view-tabs-bar, .modal-box, select, input')) return;

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

async function handleExecuteBatchDeleteBooks() {
  if (!selectedBookNames.value.length) return;
  const ok = await batchDeleteBooks(selectedBookNames.value);
  if (ok) {
    selectedBookNames.value = [];
    showBatchBookModal.value = false;
  }
}

function triggerBatchFilePicker() {
  batchFileInput.value?.click();
}

function handleBatchFileSelect(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (!files || !files.length) return;
  batchImportFilesList.value = Array.from(files);
}

async function handleExecuteBatchImport() {
  if (!batchImportFilesList.value.length) return;
  const count = await batchImportBooks(batchImportFilesList.value);
  if (count > 0) {
    batchImportFilesList.value = [];
    showBatchBookModal.value = false;
  }
}

function setBookScope(scope: BookScopeFilter) {
  lorebookState.bookScope = scope;
  const list = filteredBooks.value;
  if (list.length > 0 && !list.includes(lorebookState.currentBook)) {
    void selectWorldBook(list[0]);
  }
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
  duplicateEntry(uid);
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
          <i class="fa-solid fa-book-bookmark book-icon"></i>
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

        <!-- 批量管理世界书 (批量删除与批量导入) -->
        <button
          class="icon-btn"
          @click="openBatchBookModal"
          title="批量管理世界书 (删除/导入)"
        >
          <i class="fa-solid fa-boxes-stacked"></i>
        </button>

        <!-- 操作历史与撤回 (近20条记录) -->
        <button
          class="icon-btn"
          @click="showHistoryModal = true"
          title="操作日志与撤回"
        >
          <i class="fa-solid fa-clock-rotate-left"></i>
        </button>

        <!-- 新建世界书 -->
        <button
          class="icon-btn"
          @click="showNewBookModal = true"
          title="新建世界书"
        >
          <i class="fa-solid fa-folder-plus"></i>
        </button>

        <!-- 重命名世界书 -->
        <button
          v-if="lorebookState.currentBook"
          class="icon-btn"
          @click="openRenameModal"
          title="重命名世界书"
        >
          <i class="fa-solid fa-pen-to-square"></i>
        </button>

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

        <!-- 刷新列表 -->
        <button
          class="icon-btn"
          @click="loadWorldBooks"
          :class="{ spinning: lorebookState.isLoadingBooks }"
          title="刷新世界书列表"
        >
          <i class="fa-solid fa-rotate-right"></i>
        </button>

        <!-- 删除世界书 -->
        <button
          v-if="lorebookState.currentBook"
          class="icon-btn danger-icon"
          @click="showDeleteBookModal = true"
          title="删除当前世界书"
        >
          <i class="fa-solid fa-trash-can"></i>
        </button>
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
          <button
            v-if="lorebookState.searchQuery"
            class="clear-search-btn"
            @click="lorebookState.searchQuery = ''"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- 排序下拉列表 (对齐酒馆原生功能) -->
        <div class="sort-wrapper">
          <select v-model="lorebookState.sortOrder" class="sort-select">
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
      <div v-if="lorebookState.isLoadingData" class="state-icon-box">
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
                    <option value="green">绿灯 (触发)</option>
                    <option value="blue">蓝灯 (常驻)</option>
                    <option v-if="ui.showVectorized" value="purple">链接 (向量)</option>
                  </select>
                  <i class="fa-solid fa-caret-down pill-dropdown-arrow"></i>
                </div>

                <!-- 停用状态注明 -->
                <span v-if="entry.disable" class="badge-tag tag-gray">已停用</span>

                <!-- 所属分组徽章 (如果已设置分组) -->
                <span v-if="entry.group && entry.group.trim()" class="badge-tag tag-group">
                  <i class="fa-solid fa-folder"></i>
                  {{ entry.group }}
                </span>

                <!-- 位置与深度注明 -->
                <span v-if="entry.position === 4" class="badge-tag tag-depth">@D{{ entry.depth ?? 4 }}</span>
                <span v-else-if="entry.position === 0" class="badge-tag tag-pos">角色前</span>
                <span v-else-if="entry.position === 1" class="badge-tag tag-pos">角色后</span>
                <span v-else-if="entry.position === 2" class="badge-tag tag-pos">作者注释前</span>
                <span v-else-if="entry.position === 3" class="badge-tag tag-pos">作者注释后</span>

                <!-- 顺序号注明 -->
                <span class="badge-order">#{{ entry.order ?? 100 }}</span>
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
            v-for="grp in entryGroups"
            :key="grp.name"
            class="group-section-card"
          >
            <!-- 组行卡片 (折叠箭头、分组名、启用计数、组总开关) -->
            <div
              class="group-header-row"
              @click="toggleGroupFold(grp.name)"
            >
              <div class="group-lead-info">
                <i
                  class="fa-solid fa-chevron-right group-chevron"
                  :class="{ expanded: lorebookState.expandedGroups[grp.name] }"
                ></i>
                <span class="group-title-text">{{ grp.name }}</span>
              </div>

              <div class="group-actions-right">
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
                class="entry-card"
                :class="{
                  active: lorebookState.activeUid === entry.uid,
                  disabled: entry.disable,
                }"
                @click="openEntry(entry.uid)"
              >
                <!-- 第一行：标题 + 右侧快捷操作 -->
                <div class="card-row-top">
                  <div class="card-row-lead">
                    <span class="entry-title">{{ entry.comment || '---' }}</span>
                  </div>

                  <div class="card-quick-actions">
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
                        <option value="green">绿灯 (触发)</option>
                        <option value="blue">蓝灯 (常驻)</option>
                        <option v-if="ui.showVectorized" value="purple">链接 (向量)</option>
                      </select>
                      <i class="fa-solid fa-caret-down pill-dropdown-arrow"></i>
                    </div>
                    <span v-if="entry.disable" class="badge-tag tag-gray">已停用</span>
                    <span v-if="entry.position === 4" class="badge-tag tag-depth">@D{{ entry.depth ?? 4 }}</span>
                    <span v-else-if="entry.position === 0" class="badge-tag tag-pos">角色前</span>
                    <span v-else-if="entry.position === 1" class="badge-tag tag-pos">角色后</span>
                    <span class="badge-order">#{{ entry.order ?? 100 }}</span>
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
            <span class="metric-label">字符与预估 Token</span>
            <div class="metric-value">
              <span class="num-highlight">~{{ bookStats.estimatedTokens }}</span>
              <span class="num-sub">tk ({{ bookStats.totalChars }} 字)</span>
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
        <div class="batch-bar-lead">
          <div class="batch-counter-box">
            <span class="batch-count-text">已选 {{ lorebookState.selectedUids.length }}/{{ filteredEntries.length }}</span>
            <span v-if="lorebookState.isRangeMode" class="badge-tag tag-range">连选模式中</span>
          </div>

          <!-- 快捷勾选控制: 全选、反选、连选 -->
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
          </div>
        </div>

        <!-- 批量操作图标栏 (全部为纯图标，适配手机端) -->
        <div class="batch-actions-scroll">
          <button
            class="batch-action-item"
            :disabled="!lorebookState.selectedUids.length"
            @click="batchEnable"
            title="批量启用"
          >
            <i class="fa-solid fa-circle-check"></i>
          </button>
          <button
            class="batch-action-item"
            :disabled="!lorebookState.selectedUids.length"
            @click="batchDisable"
            title="批量停用"
          >
            <i class="fa-solid fa-ban"></i>
          </button>
          <button
            class="batch-action-item"
            :disabled="!lorebookState.selectedUids.length"
            @click="showBatchGroupModal = true"
            title="批量修改分组"
          >
            <i class="fa-solid fa-folder"></i>
          </button>
          <button
            class="batch-action-item"
            @click="batchExportJson"
            title="导出 JSON"
          >
            <i class="fa-solid fa-file-export"></i>
          </button>
          <button
            class="batch-action-item"
            @click="showImportModal = true"
            title="导入 JSON"
          >
            <i class="fa-solid fa-file-import"></i>
          </button>
          <button
            class="batch-action-item danger"
            :disabled="!lorebookState.selectedUids.length"
            @click="showBatchDeleteModal = true"
            title="批量删除"
          >
            <i class="fa-solid fa-trash-can"></i>
          </button>
          <button
            class="batch-action-item btn-close-batch"
            @click="lorebookState.isBatchMode = false"
            title="完成并退出多选"
          >
            <i class="fa-solid fa-xmark"></i>
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
            <button type="button" class="batch-danger-execute-btn" @click="handleExecuteBatchDeleteBooks">
              <i class="fa-solid fa-trash-can"></i>
              <span>确认删除选中的 {{ selectedBookNames.length }} 本世界书</span>
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
          <div class="import-dropzone" @click="triggerBatchFilePicker">
            <i class="fa-solid fa-cloud-arrow-up drop-icon"></i>
            <span class="drop-text">点击选择多个世界书 JSON 文件</span>
            <span class="drop-subtext">支持单次选择多份 .json 文件批量导入</span>
          </div>

          <div v-if="batchImportFilesList.length" class="batch-file-preview-list">
            <div class="preview-head">
              <span>待导入文件 ({{ batchImportFilesList.length }})：</span>
              <button type="button" class="mini-tool-btn text-xs" @click="batchImportFilesList = []">清除</button>
            </div>
            <div class="file-names-scroll">
              <div v-for="(f, i) in batchImportFilesList" :key="i" class="file-preview-row">
                <i class="fa-solid fa-file-code"></i>
                <span class="preview-filename">{{ f.name }}</span>
                <span class="preview-filesize">({{ (f.size / 1024).toFixed(1) }} KB)</span>
              </div>
            </div>
            <button type="button" class="batch-execute-import-btn" @click="handleExecuteBatchImport">
              <i class="fa-solid fa-file-import"></i>
              <span>开始批量导入 ({{ batchImportFilesList.length }} 个文件)</span>
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
  display: flex;
  align-items: center;
  gap: 6px;
}

.select-wrapper {
  position: relative;
  flex: 1;
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
  height: 36px;
  padding-left: 32px;
  padding-right: 12px;
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius-sm);
  background: var(--myext-surface-2);
  color: var(--myext-ink);
  font-size: 13px;
  font-weight: 500;
  outline: none;
  cursor: pointer;
}

.book-select:focus {
  border-color: var(--myext-accent);
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
  padding-right: 26px;
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

.clear-search-btn {
  position: absolute;
  right: 6px;
  background: none;
  border: none;
  color: var(--myext-ink-muted);
  cursor: pointer;
  padding: 4px;
  font-size: 12px;
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
  transition: all 0.15s;
}

.entry-card:active {
  background: var(--myext-surface-2);
  transform: scale(0.99);
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
  transition: all 0.15s ease;
  touch-action: manipulation;
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

.tag-depth {
  background: rgba(147, 130, 158, 0.15);
  color: #b7a4c4;
  border: 1px solid rgba(147, 130, 158, 0.28);
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
  backdrop-filter: blur(4px);
}

.modal-box {
  background: var(--myext-surface);
  border: 1px solid var(--myext-line-strong);
  border-radius: var(--myext-radius);
  padding: 14px;
  width: 100%;
  max-width: 340px;
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

.import-dropzone:hover {
  border-color: var(--myext-accent);
  background: rgba(110, 150, 129, 0.05);
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
</style>
