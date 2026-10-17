import { reactive, ref, computed, watch } from 'vue';
import {
  fetchWorldBookList,
  fetchWorldBookData,
  saveWorldBookData,
  createNewWorldBook,
  deleteWorldBook,
  batchDeleteWorldBooks,
  importWorldBookFromJson,
  renameWorldBook,
  getBoundWorldBooks,
  getCachedWorldBookData,
  createEntryTemplate,
  getFreeUid,
  type WorldInfoData,
  type WorldInfoEntry,
  type BoundWorldBooks,
} from '@/api/lorebook';
import {
  loadSnapshots,
  createSnapshot,
  deleteSnapshot,
  applySnapshot,
  overwriteSnapshot,
  compareSnapshot,
  type WorldBookSnapshot,
  type SnapshotDiff,
} from '@/api/snapshots';
import {
  fetchLastActivation,
  listenActivations,
  type WorldInfoActivationBatch,
} from '@/api/activation';
import { toast } from '@/st/toast';
import { ui, onAppClose } from '@/state/ui';
import { recordAction } from '@/state/history';

export type { WorldBookSnapshot, SnapshotDiff } from '@/api/snapshots';
export type { WorldInfoActivationBatch, WorldInfoActivationEntry } from '@/api/activation';

export type FilterType = 'all' | 'enabled' | 'disabled' | 'constant' | 'vectorized';
export type FontSize = 'sm' | 'md' | 'lg';
export type WorldBookTab = 'entries' | 'groups' | 'snapshots' | 'monitor';
export type BookScopeFilter = 'all' | 'character' | 'chat' | 'global';

export interface EntryGroup {
  name: string;
  entries: WorldInfoEntry[];
  enabledCount: number;
  totalCount: number;
  allEnabled: boolean;
}

export type SortOrder =
  | 'priority'
  | 'custom'
  | 'title_asc'
  | 'title_desc'
  | 'token_asc'
  | 'token_desc'
  | 'depth_asc'
  | 'depth_desc'
  | 'order_asc'
  | 'order_desc'
  | 'uid_asc'
  | 'uid_desc'
  | 'prob_asc'
  | 'prob_desc';

const LAST_BOOK_STORAGE_KEY = 'st_fluent_lorebook.last_book';
const SORT_STORAGE_KEY = 'st_fluent_lorebook.sort_order';

function loadSortOrder(): SortOrder {
  try {
    return (localStorage.getItem(SORT_STORAGE_KEY) as SortOrder) || 'order_asc';
  } catch {
    return 'order_asc';
  }
}

const GROUP_STORAGE_PREFIX = 'st_fluent_lorebook_groups:';

function getGroupStorageKey(bookName: string): string {
  return `${GROUP_STORAGE_PREFIX}${encodeURIComponent(bookName.trim())}`;
}

export function saveGroupStorage(bookName: string, data: WorldInfoData | null): void {
  if (!bookName || !data?.entries) return;
  try {
    const map: Record<number, string> = {};
    for (const [uidStr, entry] of Object.entries(data.entries)) {
      if (entry.group && entry.group.trim()) {
        map[Number(uidStr)] = entry.group.trim();
      }
    }
    localStorage.setItem(getGroupStorageKey(bookName), JSON.stringify(map));
  } catch (err) {
    console.error('[Lorebook] saveGroupStorage error:', err);
  }
}

export function loadGroupStorage(bookName: string): Record<number, string> {
  if (!bookName) return {};
  try {
    const raw = localStorage.getItem(getGroupStorageKey(bookName));
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

export const lorebookState = reactive({
  books: [] as string[],
  currentBook: '' as string,
  bookData: null as WorldInfoData | null,
  activeUid: null as number | null,
  searchQuery: '',
  filterType: 'all' as FilterType,
  sortOrder: loadSortOrder() as SortOrder,
  activeTab: 'entries' as WorldBookTab,
  bookScope: 'all' as BookScopeFilter,
  boundBooks: { character: [], chat: [], global: [] } as BoundWorldBooks,
  expandedGroups: {} as Record<string, boolean>,
  snapshots: [] as WorldBookSnapshot[],
  lastActivationBatch: null as WorldInfoActivationBatch | null,
  isBatchMode: false,
  isRangeMode: false,
  lastSelectedUid: null as number | null,
  selectedUids: [] as number[],
  isLoadingBooks: false,
  isLoadingData: false,
  isSaving: false,
  isDirty: false,
  lastSavedTime: null as string | null,
  fontSize: 'md' as FontSize,
  zenMode: false,
  showAdvanced: false,
  viewMode: 'list' as 'list' | 'editor',
  savedScrollTop: 0,
});

watch(
  () => ui.showVectorized,
  show => {
    if (!show && lorebookState.filterType === 'vectorized') {
      lorebookState.filterType = 'all';
    }
  },
);

watch(
  () => lorebookState.sortOrder,
  val => {
    try {
      localStorage.setItem(SORT_STORAGE_KEY, val);
    } catch {
      /* ignore */
    }
  },
);

let saveTimer: ReturnType<typeof setTimeout> | null = null;

// 当用户关闭/收起拓展面板时，若有未保存的脏数据立即强制落盘并热同步至酒馆
onAppClose(() => {
  if (lorebookState.isDirty && !lorebookState.isSaving) {
    void saveImmediately();
  }
});

export const activeEntry = computed<WorldInfoEntry | null>(() => {
  if (!lorebookState.bookData || lorebookState.activeUid === null) return null;
  return lorebookState.bookData.entries[lorebookState.activeUid] ?? null;
});

export const filteredEntries = computed<WorldInfoEntry[]>(() => {
  if (!lorebookState.bookData) return [];
  const list = Object.values(lorebookState.bookData.entries);

  // 排序实现（对齐 SillyTavern 原生规则）
  list.sort((a, b) => {
    let res = 0;
    switch (lorebookState.sortOrder) {
      case 'priority': {
        const valA = a.disable ? 3 : a.constant ? 0 : a.vectorized ? 1 : 2;
        const valB = b.disable ? 3 : b.constant ? 0 : b.vectorized ? 1 : 2;
        res = valA - valB;
        break;
      }
      case 'custom': {
        res = (a.displayIndex ?? 0) - (b.displayIndex ?? 0);
        break;
      }
      case 'title_asc': {
        res = (a.comment || '').localeCompare(b.comment || '');
        break;
      }
      case 'title_desc': {
        res = (b.comment || '').localeCompare(a.comment || '');
        break;
      }
      case 'token_asc': {
        res = (a.content?.length || 0) - (b.content?.length || 0);
        break;
      }
      case 'token_desc': {
        res = (b.content?.length || 0) - (a.content?.length || 0);
        break;
      }
      case 'depth_asc': {
        res = (a.depth ?? 4) - (b.depth ?? 4);
        break;
      }
      case 'depth_desc': {
        res = (b.depth ?? 4) - (a.depth ?? 4);
        break;
      }
      case 'order_asc': {
        res = (a.order ?? 100) - (b.order ?? 100);
        break;
      }
      case 'order_desc': {
        res = (b.order ?? 100) - (a.order ?? 100);
        break;
      }
      case 'uid_asc': {
        res = a.uid - b.uid;
        break;
      }
      case 'uid_desc': {
        res = b.uid - a.uid;
        break;
      }
      case 'prob_asc': {
        res = (a.probability ?? 100) - (b.probability ?? 100);
        break;
      }
      case 'prob_desc': {
        res = (b.probability ?? 100) - (a.probability ?? 100);
        break;
      }
    }
    // 次级排序：按顺序正序与 UID
    return res || (a.order ?? 100) - (b.order ?? 100) || a.uid - b.uid;
  });

  const query = lorebookState.searchQuery.trim().toLowerCase();
  const filter = lorebookState.filterType;

  return list.filter(entry => {
    // 状态与策略过滤
    if (filter === 'enabled' && entry.disable) return false;
    if (filter === 'disabled' && !entry.disable) return false;
    if (filter === 'constant' && !entry.constant) return false;
    if (filter === 'vectorized' && !entry.vectorized) return false;

    // 关键词/内容搜索
    if (!query) return true;
    const commentMatch = (entry.comment || '').toLowerCase().includes(query);
    const contentMatch = (entry.content || '').toLowerCase().includes(query);
    const keyMatch = (entry.key || []).some(k => k.toLowerCase().includes(query));
    const secKeyMatch = (entry.keysecondary || []).some(k => k.toLowerCase().includes(query));

    return commentMatch || contentMatch || keyMatch || secKeyMatch;
  });
});

/**
 * 根据绑定范围过滤显示的世界书列表
 */
export const filteredBooks = computed<string[]>(() => {
  const scope = lorebookState.bookScope;
  if (scope === 'all') return lorebookState.books;
  const bound = lorebookState.boundBooks;
  if (scope === 'character') return lorebookState.books.filter(b => bound.character.includes(b));
  if (scope === 'chat') return lorebookState.books.filter(b => bound.chat.includes(b));
  if (scope === 'global') return lorebookState.books.filter(b => bound.global.includes(b));
  return lorebookState.books;
});

/**
 * 计算条目分组列表（仅影响显示，不污染底层逻辑）
 */
export const entryGroups = computed<EntryGroup[]>(() => {
  if (!lorebookState.bookData) return [];
  const entries = filteredEntries.value;
  const map: Record<string, WorldInfoEntry[]> = {};

  for (const entry of entries) {
    const grp = (entry.group || '').trim() || '未分组';
    if (!map[grp]) map[grp] = [];
    map[grp].push(entry);
  }

  const keys = Object.keys(map).sort((a, b) => {
    if (a === '未分组') return 1;
    if (b === '未分组') return -1;
    return a.localeCompare(b);
  });

  return keys.map(name => {
    const list = map[name];
    const totalCount = list.length;
    const enabledCount = list.filter(e => !e.disable).length;
    return {
      name,
      entries: list,
      enabledCount,
      totalCount,
      allEnabled: totalCount > 0 && enabledCount === totalCount,
    };
  });
});

/**
 * 世界书数据与趣味统计
 */
export const bookStats = computed(() => {
  if (lorebookState.activeTab !== 'monitor' || !lorebookState.bookData) {
    return {
      totalEntries: 0,
      activeEntries: 0,
      totalChars: 0,
      estimatedTokens: 0,
      constantCount: 0,
      selectiveCount: 0,
      vectorizedCount: 0,
      groupCount: 0,
    };
  }

  const entries = Object.values(lorebookState.bookData.entries);
  let totalChars = 0;
  let activeEntries = 0;
  let constantCount = 0;
  let selectiveCount = 0;
  let vectorizedCount = 0;
  const groups = new Set<string>();

  for (const e of entries) {
    const text = (e.content || '') + (e.comment || '');
    totalChars += text.length;
    if (!e.disable) {
      activeEntries++;
      if (e.constant) constantCount++;
      else if (e.vectorized) vectorizedCount++;
      else selectiveCount++;
    }
    if (e.group && e.group.trim()) groups.add(e.group.trim());
  }

  const estTokens = Math.ceil(totalChars * 0.75);

  return {
    totalEntries: entries.length,
    activeEntries,
    totalChars,
    estimatedTokens: estTokens,
    constantCount,
    selectiveCount,
    vectorizedCount,
    groupCount: groups.size,
  };
});

/**
 * 刷新绑定世界书信息
 */
export function refreshBoundBooks(): void {
  try {
    lorebookState.boundBooks = getBoundWorldBooks();
  } catch (err) {
    console.debug('[Lorebook] refreshBoundBooks error:', err);
  }
}

/**
 * 加载世界书列表
 */
export async function loadWorldBooks(forceReloadCurrent = false): Promise<void> {
  lorebookState.isLoadingBooks = true;
  refreshBoundBooks();
  try {
    const list = await fetchWorldBookList();
    lorebookState.books = list;

    // 如果还没有选择当前书，尝试读取上次浏览的或者第一本
    if (!lorebookState.currentBook || !list.includes(lorebookState.currentBook)) {
      const last = localStorage.getItem(LAST_BOOK_STORAGE_KEY);
      const target = (last && list.includes(last)) ? last : (list[0] || '');
      if (target) {
        await selectWorldBook(target);
      }
    } else if (forceReloadCurrent && lorebookState.currentBook) {
      await selectWorldBook(lorebookState.currentBook, true, true);
    }
  } finally {
    lorebookState.isLoadingBooks = false;
  }
}

function applyWorldBookData(data: WorldInfoData, name: string, keepActiveUid: boolean, prevActiveUid: number | null): void {
  const localGroups = loadGroupStorage(name);
  for (const [uidStr, entry] of Object.entries(data.entries)) {
    const uid = Number(uidStr);
    const extGroup = (entry as any).extensions?.group;
    const localGrp = localGroups[uid];
    if (!entry.group && (extGroup || localGrp)) {
      entry.group = extGroup || localGrp || '';
    }
    if (entry.group) {
      if (!entry.extensions) entry.extensions = {};
      (entry.extensions as any).group = entry.group;
    }
  }
  lorebookState.bookData = data;
  const uids = Object.keys(data.entries).map(Number);
  if (keepActiveUid && prevActiveUid !== null && uids.includes(prevActiveUid)) {
    lorebookState.activeUid = prevActiveUid;
  } else if (uids.length > 0) {
    lorebookState.activeUid = uids[0];
  }
}

/**
 * 切换或重载选中的世界书（支持内存即时呈现，避免卸载DOM与滚动跳动）
 */
export async function selectWorldBook(name: string, keepActiveUid = false, forceReload = false): Promise<void> {
  if (!name) return;

  // 1. 如果已处于当前世界书且已有数据，且非强制重载，则直接刷新绑定与快照后返回，0ms即时响应
  if (!forceReload && lorebookState.currentBook === name && lorebookState.bookData) {
    refreshBoundBooks();
    refreshSnapshots();
    return;
  }

  if (lorebookState.isDirty && lorebookState.currentBook) {
    await saveImmediately();
  }

  const prevActiveUid = lorebookState.activeUid;
  lorebookState.currentBook = name;
  localStorage.setItem(LAST_BOOK_STORAGE_KEY, name);
  if (!keepActiveUid) {
    lorebookState.activeUid = null;
  }
  lorebookState.isDirty = false;
  lorebookState.isBatchMode = false;
  lorebookState.selectedUids = [];
  refreshSnapshots();
  refreshBoundBooks();

  // 2. 检查内存缓存是否有现成数据，有则零延迟立即呈现
  const cached = getCachedWorldBookData(name);
  if (cached && !forceReload) {
    applyWorldBookData(cached, name, keepActiveUid, prevActiveUid);
    lorebookState.isLoadingData = false;
    return;
  }

  // 3. 仅在首次无任何数据时才展示全局加载态，避免已有列表被反复清空造成视觉跳动
  if (!lorebookState.bookData) {
    lorebookState.isLoadingData = true;
  }

  try {
    const data = await fetchWorldBookData(name, forceReload);
    if (data) {
      applyWorldBookData(data, name, keepActiveUid, prevActiveUid);
    }
  } finally {
    lorebookState.isLoadingData = false;
  }
}

/**
 * 选中并打开词条（进入编辑器）
 */
export function openEntry(uid: number): void {
  lorebookState.activeUid = uid;
  lorebookState.viewMode = 'editor';
}

/**
 * 关闭编辑器（返回列表）
 */
export function closeEditor(): void {
  if (lorebookState.isDirty && !lorebookState.isSaving) {
    void saveImmediately();
  }
  lorebookState.viewMode = 'list';
}

/**
 * 切换选中的词条
 */
export function selectEntry(uid: number): void {
  lorebookState.activeUid = uid;
}

/**
 * 快速创建新词条并进入编辑
 */
export function addNewEntry(): WorldInfoEntry | null {
  if (!lorebookState.bookData) return null;
  const newUid = getFreeUid(lorebookState.bookData);
  const entry = createEntryTemplate(newUid);

  // 确保新词条所属分组被展开可见
  const grp = (entry.group || '').trim() || '未分组';
  lorebookState.expandedGroups[grp] = true;

  // 清除搜索和过滤条件，防止新建词条被筛选器隐藏
  lorebookState.searchQuery = '';
  lorebookState.filterType = 'all';

  lorebookState.bookData.entries[newUid] = entry;
  lorebookState.activeUid = newUid;
  lorebookState.viewMode = 'editor';
  markDirty();
  void saveImmediately();
  recordAction(`新建词条 [${entry.comment || '#' + newUid}]`, () => {
    if (!lorebookState.bookData?.entries[newUid]) return;
    delete lorebookState.bookData.entries[newUid];
    if (lorebookState.activeUid === newUid) {
      const remaining = Object.keys(lorebookState.bookData.entries).map(Number);
      lorebookState.activeUid = remaining.length > 0 ? remaining[0] : null;
    }
    markDirty();
    void saveImmediately();
    toast(`已撤回新建词条 #${newUid}`, 'info');
  });
  return entry;
}

/**
 * 复制词条
 */
export function duplicateEntry(uid: number): WorldInfoEntry | null {
  if (!lorebookState.bookData) return null;
  const src = lorebookState.bookData.entries[uid];
  if (!src) return null;

  const newUid = getFreeUid(lorebookState.bookData);
  const cloned: WorldInfoEntry = {
    ...JSON.parse(JSON.stringify(src)),
    uid: newUid,
    comment: `${src.comment || '词条'}_副本`,
  };

  // 确保副本所属分组展开可见
  const grp = (cloned.group || '').trim() || '未分组';
  lorebookState.expandedGroups[grp] = true;

  // 清除搜索和过滤条件，防止复制后的词条被过滤隐藏
  lorebookState.searchQuery = '';
  lorebookState.filterType = 'all';

  lorebookState.bookData.entries[newUid] = cloned;
  lorebookState.activeUid = newUid;
  markDirty();
  void saveImmediately();
  toast(`已成功复制词条副本 #${newUid}`, 'success');
  recordAction(`复制词条 [${src.comment || '#' + uid}] -> #${newUid}`, () => {
    if (!lorebookState.bookData?.entries[newUid]) return;
    delete lorebookState.bookData.entries[newUid];
    markDirty();
    void saveImmediately();
    toast(`已撤回复制词条 #${newUid}`, 'info');
  });
  return cloned;
}

/**
 * 删除词条
 */
export function removeEntry(uid: number): void {
  if (!lorebookState.bookData) return;
  const entry = lorebookState.bookData.entries[uid];
  if (!entry) return;
  const backup = JSON.parse(JSON.stringify(entry));
  delete lorebookState.bookData.entries[uid];

  if (lorebookState.activeUid === uid) {
    const remaining = Object.keys(lorebookState.bookData.entries).map(Number);
    lorebookState.activeUid = remaining.length > 0 ? remaining[0] : null;
  }
  markDirty();
  void saveImmediately();
  toast(`已删除词条 #${uid}`, 'info');
  recordAction(`删除词条 [${backup.comment || '#' + uid}]`, () => {
    if (!lorebookState.bookData) return;
    lorebookState.bookData.entries[uid] = backup;
    markDirty();
    void saveImmediately();
    toast(`已恢复词条 [${backup.comment || '#' + uid}]`, 'success');
  });
}

/**
 * 设置词条激活策略（绿灯/蓝灯/紫灯）
 */
export function setEntryStrategy(uid: number, strategy: 'green' | 'blue' | 'purple'): void {
  if (!lorebookState.bookData) return;
  const entry = lorebookState.bookData.entries[uid];
  if (!entry) return;
  const prevConst = entry.constant;
  const prevVect = entry.vectorized;

  if (strategy === 'green') {
    entry.constant = false;
    entry.vectorized = false;
  } else if (strategy === 'blue') {
    entry.constant = true;
    entry.vectorized = false;
  } else if (strategy === 'purple') {
    entry.constant = false;
    entry.vectorized = true;
  }
  markDirty();
  void saveImmediately();
  const label = strategy === 'green' ? '绿灯' : strategy === 'blue' ? '蓝灯' : '链接';
  recordAction(`将词条 [${entry.comment || '#' + uid}] 策略改为 ${label}`, () => {
    if (!lorebookState.bookData?.entries[uid]) return;
    lorebookState.bookData.entries[uid].constant = prevConst;
    lorebookState.bookData.entries[uid].vectorized = prevVect;
    markDirty();
    void saveImmediately();
    toast(`已撤回词条 [${entry.comment || '#' + uid}] 的策略变更`, 'info');
  });
}

/**
 * 循环切换词条激活策略：绿灯 (按词触发) -> 蓝灯 (常驻注入) -> 链接 (向量化/嵌入) -> 绿灯
 */
export function cycleEntryStrategy(uid: number): void {
  if (!lorebookState.bookData) return;
  const entry = lorebookState.bookData.entries[uid];
  if (!entry) return;
  if (!entry.constant && !entry.vectorized) {
    setEntryStrategy(uid, 'blue');
  } else if (entry.constant && !entry.vectorized) {
    if (ui.showVectorized) {
      setEntryStrategy(uid, 'purple');
    } else {
      setEntryStrategy(uid, 'green');
    }
  } else {
    setEntryStrategy(uid, 'green');
  }
}

/**
 * 循环切换词条状态（兼容性函数）
 */
export function cycleEntryStatus(uid: number): void {
  cycleEntryStrategy(uid);
}

/**
 * 切换词条启用/禁用状态
 */
export function toggleEntryDisable(uid: number): void {
  if (!lorebookState.bookData) return;
  const entry = lorebookState.bookData.entries[uid];
  if (entry) {
    const prev = entry.disable;
    entry.disable = !prev;
    markDirty();
    void saveImmediately();
    recordAction(`${entry.disable ? '停用' : '启用'}词条 [${entry.comment || '#' + uid}]`, () => {
      if (!lorebookState.bookData?.entries[uid]) return;
      lorebookState.bookData.entries[uid].disable = prev;
      markDirty();
      void saveImmediately();
      toast(`已撤回词条 [${entry.comment || '#' + uid}] 的启停状态`, 'info');
    });
  }
}

/**
 * 标记脏状态并调度自动保存
 */
export function markDirty(): void {
  lorebookState.isDirty = true;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  // 仅在开启自动保存且为 idle 模式时在停笔后调度
  if (ui.autoSave && ui.autoSaveMode === 'idle') {
    const delay = typeof ui.autoSaveDelay === 'number' ? ui.autoSaveDelay : 3000;
    saveTimer = setTimeout(() => {
      void saveImmediately();
    }, delay);
  }
}

/**
 * 离开输入框/收起键盘时的离焦保存
 */
export function handleBlurSave(): void {
  if (ui.autoSave && (ui.autoSaveMode === 'blur' || ui.autoSaveMode === 'idle')) {
    if (lorebookState.isDirty && !lorebookState.isSaving) {
      void saveImmediately();
    }
  }
}

/**
 * 立即保存世界书
 */
export async function saveImmediately(): Promise<boolean> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  if (!lorebookState.currentBook || !lorebookState.bookData) {
    lorebookState.isDirty = false;
    return false;
  }

  lorebookState.isSaving = true;
  try {
    for (const entry of Object.values(lorebookState.bookData.entries)) {
      if (entry.group !== undefined) {
        if (!entry.extensions) entry.extensions = {};
        (entry.extensions as any).group = entry.group || '';
      }
    }
    saveGroupStorage(lorebookState.currentBook, lorebookState.bookData);

    const ok = await saveWorldBookData(lorebookState.currentBook, lorebookState.bookData);
    if (ok) {
      lorebookState.isDirty = false;
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      lorebookState.lastSavedTime = timeStr;
    }
    return ok;
  } finally {
    lorebookState.isSaving = false;
  }
}

/**
 * 新建一本世界书
 */
export async function createBook(name: string): Promise<boolean> {
  const ok = await createNewWorldBook(name);
  if (ok) {
    toast(`已成功创建世界书《${name}》`, 'success');
    await loadWorldBooks();
    await selectWorldBook(name);
  } else {
    toast('创建世界书失败，可能名称重名或非法', 'warning');
  }
  return ok;
}

/**
 * 删除当前选中的世界书
 */
export async function deleteCurrentBook(): Promise<boolean> {
  const name = lorebookState.currentBook;
  if (!name) return false;
  const ok = await deleteWorldBook(name);
  if (ok) {
    toast(`世界书《${name}》已删除`, 'info');
    lorebookState.currentBook = '';
    lorebookState.bookData = null;
    lorebookState.activeUid = null;
    await loadWorldBooks();
  } else {
    toast('删除失败', 'warning');
  }
  return ok;
}

/**
 * 重命名当前世界书
 */
export async function renameCurrentBook(newName: string): Promise<boolean> {
  const oldName = lorebookState.currentBook;
  if (!oldName || !lorebookState.bookData) return false;
  const cleanNew = newName.trim();
  if (!cleanNew || cleanNew === oldName) return false;

  const ok = await renameWorldBook(oldName, cleanNew, lorebookState.bookData);
  if (ok) {
    toast(`已成功重命名为《${cleanNew}》`, 'success');
    await loadWorldBooks();
    await selectWorldBook(cleanNew);
  } else {
    toast('重命名失败，可能名称重名或非法', 'warning');
  }
  return ok;
}

/**
 * 组级一键总开关：全部开启时点击则全部停用；部分或未开启时点击则全部开启
 */
export async function toggleGroupEnabled(groupName: string): Promise<void> {
  if (!lorebookState.bookData) return;
  const grp = entryGroups.value.find(g => g.name === groupName);
  if (!grp) return;

  const targetDisable = grp.allEnabled;
  for (const entry of grp.entries) {
    entry.disable = targetDisable;
  }
  markDirty();
  await saveImmediately();
}

/**
 * 折叠 / 展开指定分组
 */
export function toggleGroupFold(groupName: string): void {
  lorebookState.expandedGroups[groupName] = !lorebookState.expandedGroups[groupName];
}

/**
 * 刷新当前世界书快照列表
 */
export function refreshSnapshots(): void {
  if (!lorebookState.currentBook) {
    lorebookState.snapshots = [];
    return;
  }
  lorebookState.snapshots = loadSnapshots(lorebookState.currentBook);
}

/**
 * 记录并保存当前世界书状态为新快照
 */
export function takeSnapshot(name: string): boolean {
  if (!lorebookState.currentBook || !lorebookState.bookData) return false;
  createSnapshot(lorebookState.currentBook, name, lorebookState.bookData);
  refreshSnapshots();
  toast('已保存当前快照', 'success');
  return true;
}

/**
 * 应用并还原快照对应的条目启闭状态
 */
export function applyBookSnapshot(snapshot: WorldBookSnapshot): boolean {
  if (!lorebookState.bookData) return false;
  const changed = applySnapshot(snapshot, lorebookState.bookData);
  if (changed) {
    markDirty();
    void saveImmediately();
    toast(`已还原快照《${snapshot.name}》`, 'success');
  } else {
    toast(`当前状态与快照《${snapshot.name}》完全一致`, 'info');
  }
  return changed;
}

/**
 * 删除快照
 */
export function removeBookSnapshot(id: string): void {
  if (!lorebookState.currentBook) return;
  deleteSnapshot(lorebookState.currentBook, id);
  refreshSnapshots();
  toast('已删除快照', 'info');
}

/**
 * 用当前世界书所有条目的开启/停用状态覆盖指定的快照
 */
export function overwriteBookSnapshot(snapshotId: string): boolean {
  if (!lorebookState.currentBook || !lorebookState.bookData) return false;
  const ok = overwriteSnapshot(snapshotId, lorebookState.currentBook, lorebookState.bookData);
  if (ok) {
    refreshSnapshots();
    toast('已使用当前状态覆盖快照', 'success');
  }
  return ok;
}

/**
 * 获取指定快照与当前条目开启状态的差异
 */
export function getSnapshotDiff(snapshot: WorldBookSnapshot): SnapshotDiff {
  if (!lorebookState.bookData) {
    return { toEnable: [], toDisable: [], identical: true };
  }
  return compareSnapshot(snapshot, lorebookState.bookData);
}

/**
 * 切换多选批量整理模式
 */
export function toggleBatchMode(): void {
  lorebookState.isBatchMode = !lorebookState.isBatchMode;
  if (!lorebookState.isBatchMode) {
    lorebookState.selectedUids = [];
    lorebookState.isRangeMode = false;
    lorebookState.lastSelectedUid = null;
  }
}

/**
 * 切换条目选中状态
 */
export function toggleSelectUid(uid: number): void {
  if (lorebookState.isRangeMode && lorebookState.lastSelectedUid !== null) {
    selectRangeTo(uid);
    return;
  }

  const idx = lorebookState.selectedUids.indexOf(uid);
  if (idx === -1) {
    lorebookState.selectedUids.push(uid);
    lorebookState.lastSelectedUid = uid;
  } else {
    lorebookState.selectedUids.splice(idx, 1);
    lorebookState.lastSelectedUid = uid;
  }
}

/**
 * 连选：从上次选中的条目到目标条目之间的所有条目全部选中
 */
export function selectRangeTo(targetUid: number): void {
  if (lorebookState.lastSelectedUid === null) {
    toggleSelectUid(targetUid);
    return;
  }
  const list = filteredEntries.value.map(e => e.uid);
  const idxA = list.indexOf(lorebookState.lastSelectedUid);
  const idxB = list.indexOf(targetUid);
  if (idxA === -1 || idxB === -1) {
    toggleSelectUid(targetUid);
    return;
  }
  const start = Math.min(idxA, idxB);
  const end = Math.max(idxA, idxB);
  const set = new Set(lorebookState.selectedUids);
  for (let i = start; i <= end; i++) {
    set.add(list[i]);
  }
  lorebookState.selectedUids = Array.from(set);
  lorebookState.lastSelectedUid = targetUid;
  toast(`已连选 ${end - start + 1} 个条目`, 'info');
}

/**
 * 反选当前所有可见条目
 */
export function invertSelection(): void {
  const currentSet = new Set(lorebookState.selectedUids);
  const allUids = filteredEntries.value.map(e => e.uid);
  lorebookState.selectedUids = allUids.filter(uid => !currentSet.has(uid));
  toast(`已反选（当前选中 ${lorebookState.selectedUids.length} 项）`, 'info');
}

/**
 * 全选当前可见条目
 */
export function selectAll(): void {
  lorebookState.selectedUids = filteredEntries.value.map(e => e.uid);
}

/**
 * 取消全选
 */
export function deselectAll(): void {
  lorebookState.selectedUids = [];
  lorebookState.lastSelectedUid = null;
}

/**
 * 批量启用选中条目
 */
export function batchEnable(): void {
  if (!lorebookState.bookData || lorebookState.selectedUids.length === 0) return;
  const count = lorebookState.selectedUids.length;
  const prevStates: Record<number, boolean> = {};
  for (const uid of lorebookState.selectedUids) {
    const entry = lorebookState.bookData.entries[uid];
    if (entry) {
      prevStates[uid] = entry.disable;
      entry.disable = false;
    }
  }
  markDirty();
  void saveImmediately();
  toast(`已启用 ${count} 个条目`, 'success');
  recordAction(`批量启用 ${count} 个条目`, () => {
    if (!lorebookState.bookData) return;
    for (const [uStr, disabled] of Object.entries(prevStates)) {
      const e = lorebookState.bookData.entries[Number(uStr)];
      if (e) e.disable = disabled;
    }
    markDirty();
    void saveImmediately();
    toast(`已撤回批量启用 (${count} 项)`, 'info');
  });
}

/**
 * 批量停用选中条目
 */
export function batchDisable(): void {
  if (!lorebookState.bookData || lorebookState.selectedUids.length === 0) return;
  const count = lorebookState.selectedUids.length;
  const prevStates: Record<number, boolean> = {};
  for (const uid of lorebookState.selectedUids) {
    const entry = lorebookState.bookData.entries[uid];
    if (entry) {
      prevStates[uid] = entry.disable;
      entry.disable = true;
    }
  }
  markDirty();
  void saveImmediately();
  toast(`已停用 ${count} 个条目`, 'info');
  recordAction(`批量停用 ${count} 个条目`, () => {
    if (!lorebookState.bookData) return;
    for (const [uStr, disabled] of Object.entries(prevStates)) {
      const e = lorebookState.bookData.entries[Number(uStr)];
      if (e) e.disable = disabled;
    }
    markDirty();
    void saveImmediately();
    toast(`已撤回批量停用 (${count} 项)`, 'info');
  });
}

/**
 * 批量删除选中条目
 */
export function batchDelete(): void {
  if (!lorebookState.bookData || lorebookState.selectedUids.length === 0) return;
  const count = lorebookState.selectedUids.length;
  const deletedEntries: Record<number, WorldInfoEntry> = {};
  for (const uid of lorebookState.selectedUids) {
    if (lorebookState.bookData.entries[uid]) {
      deletedEntries[uid] = JSON.parse(JSON.stringify(lorebookState.bookData.entries[uid]));
      delete lorebookState.bookData.entries[uid];
    }
  }
  lorebookState.selectedUids = [];
  lorebookState.isBatchMode = false;
  markDirty();
  void saveImmediately();
  toast(`已删除 ${count} 个条目`, 'info');
  recordAction(`批量删除 ${count} 个条目`, () => {
    if (!lorebookState.bookData) return;
    for (const [uStr, entry] of Object.entries(deletedEntries)) {
      lorebookState.bookData.entries[Number(uStr)] = entry;
    }
    markDirty();
    void saveImmediately();
    toast(`已恢复批量删除的 ${count} 个条目`, 'success');
  });
}

/**
 * 批量设置分组
 */
export async function batchSetGroup(groupName: string): Promise<void> {
  if (!lorebookState.bookData || lorebookState.selectedUids.length === 0) return;
  const cleanGrp = groupName.trim();
  const count = lorebookState.selectedUids.length;
  const prevGroups: Record<number, string> = {};

  for (const uid of lorebookState.selectedUids) {
    const entry = lorebookState.bookData.entries[uid];
    if (entry) {
      prevGroups[uid] = entry.group || '';
      entry.group = cleanGrp;
      if (!entry.extensions) entry.extensions = {};
      (entry.extensions as any).group = cleanGrp;
    }
  }
  saveGroupStorage(lorebookState.currentBook, lorebookState.bookData);
  markDirty();
  await saveImmediately();
  toast(`已将选中条目移入分组「${cleanGrp || '未分组'}」`, 'success');

  recordAction(`移动 ${count} 个条目至分组「${cleanGrp || '未分组'}」`, () => {
    if (!lorebookState.bookData) return;
    for (const [uStr, grp] of Object.entries(prevGroups)) {
      const e = lorebookState.bookData.entries[Number(uStr)];
      if (e) {
        e.group = grp;
        if (!e.extensions) e.extensions = {};
        (e.extensions as any).group = grp;
      }
    }
    saveGroupStorage(lorebookState.currentBook, lorebookState.bookData);
    markDirty();
    void saveImmediately();
    toast(`已撤回分组移动 (${count} 项)`, 'info');
  });
}

/**
 * 批量删除多本世界书
 */
export async function batchDeleteBooks(names: string[]): Promise<boolean> {
  if (!names.length) return false;
  const res = await batchDeleteWorldBooks(names);
  if (res.success > 0) {
    toast(`成功删除 ${res.success} 本世界书`, 'success');
    if (names.includes(lorebookState.currentBook)) {
      lorebookState.currentBook = '';
      lorebookState.bookData = null;
    }
    await loadWorldBooks();
    return true;
  } else {
    toast('删除失败', 'warning');
    return false;
  }
}

/**
 * 批量导入多本世界书 JSON
 */
export async function batchImportBooks(files: FileList | File[]): Promise<number> {
  let count = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const bookName = file.name.replace(/\.json$/i, '');
    try {
      const text = await file.text();
      const ok = await importWorldBookFromJson(bookName, text);
      if (ok) count++;
    } catch (err) {
      console.error(`[Lorebook] Failed to import ${file.name}:`, err);
    }
  }
  if (count > 0) {
    toast(`成功导入 ${count} 本世界书`, 'success');
    await loadWorldBooks();
  } else {
    toast('导入未成功，请检查文件格式', 'warning');
  }
  return count;
}

/**
 * 批量导出选中的条目（或整本书）为 JSON 文件
 */
export function batchExportJson(): void {
  if (!lorebookState.bookData) return;
  const exportEntries: Record<string | number, WorldInfoEntry> = {};
  const uids = lorebookState.selectedUids.length > 0
    ? lorebookState.selectedUids
    : Object.keys(lorebookState.bookData.entries).map(Number);

  for (const uid of uids) {
    const entry = lorebookState.bookData.entries[uid];
    if (entry) {
      exportEntries[uid] = JSON.parse(JSON.stringify(entry));
    }
  }

  const payload = {
    entries: exportEntries,
  };
  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${lorebookState.currentBook || 'lorebook'}_entries.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`已导出 ${uids.length} 个条目`, 'success');
}

/**
 * 批量导入 JSON 条目
 */
export function batchImportJson(jsonStr: string): boolean {
  if (!lorebookState.bookData) return false;
  try {
    const data = JSON.parse(jsonStr);
    let count = 0;
    const entriesToImport: WorldInfoEntry[] = [];

    if (data.entries && typeof data.entries === 'object') {
      entriesToImport.push(...Object.values(data.entries) as WorldInfoEntry[]);
    } else if (Array.isArray(data)) {
      entriesToImport.push(...data as WorldInfoEntry[]);
    }

    for (const raw of entriesToImport) {
      if (raw && typeof raw === 'object') {
        const newUid = getFreeUid(lorebookState.bookData);
        const template = createEntryTemplate(newUid);
        const entry: WorldInfoEntry = {
          ...template,
          ...raw,
          uid: newUid,
        };
        lorebookState.bookData.entries[newUid] = entry;
        count++;
      }
    }

    if (count > 0) {
      markDirty();
      toast(`已成功导入 ${count} 个条目`, 'success');
      return true;
    }
    toast('未在文件中发现有效条目', 'warning');
    return false;
  } catch (err) {
    console.error('[Lorebook] Import JSON failed:', err);
    toast('解析 JSON 失败，文件格式可能有误', 'warning');
    return false;
  }
}

/**
 * 检查并更新上一轮触发数据
 */
export async function checkLastActivation(): Promise<void> {
  const batch = await fetchLastActivation();
  lorebookState.lastActivationBatch = batch;
}
