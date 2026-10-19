import { getContext } from '@/st/context';

export interface WorldInfoEntry {
  uid: number;
  key: string[];
  keysecondary: string[];
  comment: string;
  content: string;
  constant: boolean;
  selective: boolean;
  selectiveLogic: number; // 0: AND ANY, 1: AND ALL, 2: NOT ANY, 3: NOT ALL
  addMemo?: boolean;
  order: number;
  position: number;
  disable: boolean;
  excludeRecursion: boolean;
  preventRecursion: boolean;
  delayUntilRecursion?: boolean | number;
  probability: number;
  useProbability: boolean;
  depth: number;
  group: string;
  groupOverride: boolean;
  groupWeight: number;
  scanDepth: number | null;
  caseSensitive: boolean | null;
  matchWholeWords: boolean | null;
  useGroupScoring: boolean | null;
  automationId?: string;
  role?: number;
  vectorized?: boolean;
  sticky?: number | null;
  cooldown?: number | null;
  delay?: number | null;
  displayIndex?: number;
  [k: string]: unknown;
}

export interface WorldInfoData {
  entries: Record<string | number, WorldInfoEntry>;
  originalData?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface WorldBookMeta {
  name: string;
  entryCount?: number;
}

function getHeaders(): Record<string, string> {
  const ctx = getContext();
  const baseHeaders = ctx?.getRequestHeaders?.() ?? {};
  return {
    'Content-Type': 'application/json',
    ...baseHeaders,
  };
}

/**
 * 宿主 SillyTavern world-info 原生模块的动态桥接
 * 通过动态 import 加载酒馆原生 /scripts/world-info.js 模块，
 * 直接操作酒馆内建的全局 worldInfoCache、selected_world_info、world_names 及编辑抽屉
 */
let hostWIModulePromise: Promise<any> | null = null;

export async function getHostWorldInfo(): Promise<any> {
  if (hostWIModulePromise) return hostWIModulePromise;
  hostWIModulePromise = (async () => {
    try {
      const dynamicImport = new Function('url', 'return import(url)');
      return await dynamicImport('/scripts/world-info.js');
    } catch (err) {
      console.warn('[Lorebook] Could not dynamically load /scripts/world-info.js', err);
      return null;
    }
  })();
  return hostWIModulePromise;
}

/**
 * 读取世界书缓存（对齐酒馆原生 worldInfoCache，实现 0ms 瞬间秒开）
 */
export async function getCachedWorldBookData(name: string): Promise<WorldInfoData | null> {
  if (!name) return null;
  try {
    const hostWI = await getHostWorldInfo();
    if (hostWI?.worldInfoCache?.has?.(name)) {
      const cached = hostWI.worldInfoCache.get(name);
      if (cached && typeof cached === 'object' && cached.entries && typeof cached.entries === 'object') {
        return JSON.parse(JSON.stringify(cached));
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function setCachedWorldBookData(name: string, data: WorldInfoData): void {
  if (!name || !data) return;
  try {
    const hostWI = (window as any).SillyTavern?.getContext?.()?.worldInfo;
    if (hostWI?.worldInfoCache?.set) {
      hostWI.worldInfoCache.set(name, JSON.parse(JSON.stringify(data)));
    }
  } catch {
    /* ignore */
  }
}

export function invalidateWorldBookCache(name?: string): void {
  try {
    const hostWI = (window as any).SillyTavern?.getContext?.()?.worldInfo;
    if (name) {
      hostWI?.worldInfoCache?.delete?.(name);
    } else {
      hostWI?.worldInfoCache?.clear?.();
    }
  } catch {
    /* ignore */
  }
}

/**
 * 获取所有世界书名称列表（优先读取酒馆内存中的已就绪列表，实现 0ms 秒开）
 */
export async function fetchWorldBookList(): Promise<string[]> {
  try {
    const hostWI = await getHostWorldInfo();
    if (Array.isArray(hostWI?.world_names) && hostWI.world_names.length > 0) {
      return [...hostWI.world_names];
    }
  } catch {
    /* fallback to api */
  }

  try {
    const res = await fetch('/api/worldinfo/list', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data.map((item: any) => (typeof item === 'string' ? item : item.name || item.file_id)).filter(Boolean);
      }
    }
  } catch (err) {
    console.warn('[Lorebook] /api/worldinfo/list failed, trying fallback...', err);
  }

  // 降级回退：通过 /api/settings/get 获取
  try {
    const res = await fetch('/api/settings/get', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.world_names)) {
        return data.world_names;
      }
    }
  } catch (err) {
    console.error('[Lorebook] Failed to fetch world book list:', err);
  }

  return [];
}

/**
 * 读取单本世界书的详细数据
 * 优先读取宿主原生的 in-memory worldInfoCache，实现 0ms 瞬间秒开；若无则发起网络加载
 */
export async function fetchWorldBookData(name: string, force = false): Promise<WorldInfoData | null> {
  if (!name) return null;

  if (!force) {
    try {
      const hostWI = await getHostWorldInfo();
      if (hostWI?.worldInfoCache?.has?.(name)) {
        const cached = hostWI.worldInfoCache.get(name);
        if (cached && typeof cached === 'object' && cached.entries && typeof cached.entries === 'object') {
          return JSON.parse(JSON.stringify(cached));
        }
      }
    } catch (err) {
      console.debug('[Lorebook] Check host worldInfoCache failed:', err);
    }
  }

  try {
    const res = await fetch('/api/worldinfo/get', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data !== 'object') return null;
    if (!data.entries || typeof data.entries !== 'object') {
      data.entries = {};
    }
    const result = data as WorldInfoData;

    try {
      const hostWI = await getHostWorldInfo();
      if (hostWI?.worldInfoCache?.set) {
        hostWI.worldInfoCache.set(name, structuredClone(result));
      }
    } catch {
      /* ignore */
    }

    return result;
  } catch (err) {
    console.error(`[Lorebook] Failed to load worldbook: ${name}`, err);
    return null;
  }
}

export let lastInternalSaveTime = 0;

/**
 * 保存世界书并通知 ST 宿主刷新缓存与事件
 * 采用稳健的独立落盘设计：
 * 1. 直接请求酒馆后端 /api/worldinfo/edit，绝对不调用宿主原生 saveWorldInfo（避免全局 cancelDebounce 导致的多书/多处保存相互踩踏丢数据）
 * 2. 存盘成功后，立即同步更新酒馆宿主的 in-memory worldInfoCache（确保提示词生成与上下文扫描即时命中最新数据）
 * 3. 轻量刷新原生编辑器抽屉（若其正在打开）
 * 4. 触发 WORLDINFO_UPDATED 事件通知酒馆外部其他组件
 */
export async function saveWorldBookData(name: string, data: WorldInfoData): Promise<boolean> {
  if (!name || !data) return false;
  lastInternalSaveTime = Date.now();
  try {
    const ctx = getContext();
    const hostWI = await getHostWorldInfo();

    // 核心关键：将 Vue 3 的 Reactive Proxy 彻底转为纯净的 Plain JS Object
    // 否则 SillyTavern 的 StructuredCloneMap.get(key) 会触发 structuredClone(Proxy) 导致 DataCloneError
    const cleanData: WorldInfoData = JSON.parse(JSON.stringify(data));

    // 1. 直接向后端提交保存，带 keepalive 确保即使用户关闭窗口/切后台也能稳定完成网络传输
    const res = await fetch('/api/worldinfo/edit', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name, data: cleanData }),
      keepalive: true,
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error(`[Lorebook] Save failed with HTTP ${res.status}`);
      return false;
    }

    // 2. 存盘成功后，立即将纯净克隆写入宿主原生内存缓存（worldInfoCache）
    if (hostWI?.worldInfoCache?.set) {
      try {
        hostWI.worldInfoCache.set(name, structuredClone(cleanData));
      } catch {
        /* ignore */
      }
    }

    // 3. 实时轻量通知酒馆原生世界书编辑器（若当前正在打开）
    try {
      if (typeof ctx?.reloadWorldInfoEditor === 'function') {
        ctx.reloadWorldInfoEditor(name);
      } else if (typeof hostWI?.reloadEditor === 'function') {
        hostWI.reloadEditor(name, false);
      }
    } catch {
      /* ignore */
    }

    // 4. 触发 ST 宿主事件，通知外部环境世界书已更新
    try {
      const eventEmitter = hostWI?.eventSource ?? ctx?.eventSource;
      const eventTypes = hostWI?.event_types ?? ctx?.eventTypes;
      const eventName = eventTypes?.WORLDINFO_UPDATED || 'worldinfo_updated';
      if (eventEmitter?.emit) {
        await eventEmitter.emit(eventName, name, cleanData);
      }
    } catch (err) {
      console.warn('[Lorebook] Non-fatal error emitting WORLDINFO_UPDATED:', err);
    }

    return true;
  } catch (err) {
    console.error(`[Lorebook] Failed to save worldbook: ${name}`, err);
    return false;
  }
}

/**
 * 创建新世界书
 */
export async function createNewWorldBook(name: string): Promise<boolean> {
  const cleanName = name.trim();
  if (!cleanName) return false;
  const initialData: WorldInfoData = {
    entries: {},
  };
  return saveWorldBookData(cleanName, initialData);
}

/**
 * 删除世界书并热更新 SillyTavern 原生界面与缓存
 */
export async function deleteWorldBook(name: string): Promise<boolean> {
  if (!name) return false;
  try {
    const ctx = getContext();
    const hostWI = await getHostWorldInfo();

    let deleted = false;

    // 1. 优先调用宿主原生的 deleteWorldInfo(name)
    // 原生函数内部会：调用 /api/worldinfo/delete、清理 worldInfoCache、清理 selected_world_info、更新 updateWorldInfoList()、清理 #character_world 与 persona lorebook
    if (typeof hostWI?.deleteWorldInfo === 'function') {
      try {
        if (Array.isArray(hostWI.world_names) && hostWI.world_names.includes(name)) {
          deleted = await hostWI.deleteWorldInfo(name);
        }
      } catch (err) {
        console.warn('[Lorebook] hostWI.deleteWorldInfo failed, falling back', err);
      }
    }

    // 2. 如果原生未删除（例如未就绪或未在 world_names 中匹配到），通过 API 删除并手工做原生清理
    if (!deleted) {
      const res = await fetch('/api/worldinfo/delete', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return false;
      deleted = true;
    }

    // 3. 内存与缓存强力清理 (确保原生与插件自有缓存不再留存)
    invalidateWorldBookCache(name);
    if (hostWI?.worldInfoCache?.delete) {
      try {
        hostWI.worldInfoCache.delete(name);
      } catch {
        /* ignore */
      }
    }

    // 从全局已选原生列表中移除
    if (Array.isArray(hostWI?.selected_world_info)) {
      const idx = hostWI.selected_world_info.indexOf(name);
      if (idx !== -1) {
        hostWI.selected_world_info.splice(idx, 1);
        if (typeof hostWI?.saveSettingsDebounced === 'function') {
          hostWI.saveSettingsDebounced();
        } else if (typeof ctx?.saveSettingsDebounced === 'function') {
          ctx.saveSettingsDebounced();
        }
      }
    }

    // 4. 同步更新宿主原生世界书列表与选单
    if (typeof hostWI?.updateWorldInfoList === 'function') {
      try {
        await hostWI.updateWorldInfoList();
      } catch {
        /* ignore */
      }
    } else if (typeof ctx?.updateWorldInfoList === 'function') {
      try {
        await ctx.updateWorldInfoList();
      } catch {
        /* ignore */
      }
    }

    // 5. 原生 DOM 彻底清理与选中状态重置
    try {
      document.querySelectorAll<HTMLOptionElement>('#world_info option, #world_editor_select option, #character_world option')
        .forEach((el) => {
          if (el.textContent === name || el.value === name) {
            el.remove();
          }
        });

      // 如果原生编辑器刚才正在看这本被删除的书，重置原生编辑器为未选中并隐藏
      const editorSelect = $('#world_editor_select');
      const currentNativeSelected = String(editorSelect.find('option:selected').text());
      if (currentNativeSelected === name || !currentNativeSelected) {
        editorSelect.val('').trigger('change');
      }
    } catch {
      /* ignore */
    }

    // 6. 触发原生设置更新事件
    const eventEmitter = hostWI?.eventSource ?? ctx?.eventSource;
    const eventTypes = hostWI?.event_types ?? ctx?.eventTypes;
    if (eventEmitter?.emit) {
      const eventName = eventTypes?.WORLDINFO_SETTINGS_UPDATED || 'worldinfo_settings_updated';
      void eventEmitter.emit(eventName);
    }

    return true;
  } catch (err) {
    console.error(`[Lorebook] Failed to delete worldbook: ${name}`, err);
    return false;
  }
}

/**
 * 批量删除多本世界书
 */
export async function batchDeleteWorldBooks(names: string[]): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  for (const name of names) {
    const ok = await deleteWorldBook(name);
    if (ok) success++;
    else failed++;
  }
  return { success, failed };
}

/**
 * 从 JSON 对象或文本中解析世界书数据并保存
 */
export async function importWorldBookFromJson(name: string, content: string | object): Promise<boolean> {
  const cleanName = name.trim();
  if (!cleanName) return false;

  let parsed: any;
  if (typeof content === 'string') {
    try {
      parsed = JSON.parse(content);
    } catch {
      return false;
    }
  } else {
    parsed = content;
  }

  let finalData: WorldInfoData;
  if (parsed && typeof parsed === 'object') {
    if (parsed.entries && typeof parsed.entries === 'object') {
      finalData = parsed as WorldInfoData;
    } else if (Array.isArray(parsed)) {
      const entries: Record<string, any> = {};
      parsed.forEach((item, index) => {
        const uid = item.uid ?? index;
        entries[uid] = { ...item, uid };
      });
      finalData = { entries };
    } else {
      finalData = { entries: {} };
    }
  } else {
    return false;
  }

  return saveWorldBookData(cleanName, finalData);
}

/**
 * 重命名世界书：在新名称下写入数据，并移除旧世界书
 */
export async function renameWorldBook(oldName: string, newName: string, data: WorldInfoData): Promise<boolean> {
  const cleanOld = oldName.trim();
  const cleanNew = newName.trim();
  if (!cleanOld || !cleanNew || cleanOld === cleanNew) return false;

  // 1. 保存到新名称
  const saveOk = await saveWorldBookData(cleanNew, data);
  if (!saveOk) return false;

  // 2. 删除旧名称
  await deleteWorldBook(cleanOld);

  // 3. 触发宿主更新通知
  const ctx = getContext();
  if (ctx?.eventSource?.emit) {
    const eventName = ctx.eventTypes?.WORLDINFO_UPDATED || 'worldinfo_updated';
    void ctx.eventSource.emit(eventName, cleanNew, data);
  }

  return true;
}

export interface BoundWorldBooks {
  character: string[];
  chat: string[];
  global: string[];
}

/**
 * 探测与当前角色卡、当前聊天以及全局绑定的世界书
 */
export function getBoundWorldBooks(): BoundWorldBooks {
  const result: BoundWorldBooks = {
    character: [],
    chat: [],
    global: [],
  };

  const ctx = getContext();
  if (!ctx) return result;

  // 1. 角色卡绑定世界书
  try {
    const chid = ctx.characterId;
    if (chid !== undefined && ctx.characters && ctx.characters[chid as any]) {
      const char = ctx.characters[chid as any] as any;
      const worldName = char.data?.extensions?.world || char.world;
      if (worldName && typeof worldName === 'string') {
        result.character.push(worldName);
      }
      const charLore = ctx.world_info?.charLore || (window as any).world_info?.charLore;
      if (Array.isArray(charLore)) {
        const extra = charLore.find((e: any) => e.name === char.avatar || e.name === char.name);
        if (extra && Array.isArray(extra.extraBooks)) {
          for (const b of extra.extraBooks) {
            if (b && !result.character.includes(b)) result.character.push(b);
          }
        }
      }
    }
  } catch (err) {
    console.debug('[Lorebook] Error reading character bound books:', err);
  }

  // 2. 当前聊天绑定世界书
  try {
    const chatMeta = ctx.chatMetadata;
    if (chatMeta) {
      const wi = chatMeta.world_info || chatMeta['world_info'];
      if (typeof wi === 'string' && wi) {
        result.chat.push(wi);
      } else if (Array.isArray(wi)) {
        for (const b of wi) {
          if (typeof b === 'string' && b && !result.chat.includes(b)) result.chat.push(b);
        }
      }
    }
  } catch (err) {
    console.debug('[Lorebook] Error reading chat bound books:', err);
  }

  // 3. 全局生效世界书
  try {
    const globalSelect = ctx.world_info?.globalSelect || (window as any).world_info?.globalSelect || (window as any).selected_world_info;
    if (Array.isArray(globalSelect)) {
      for (const b of globalSelect) {
        if (typeof b === 'string' && b && !result.global.includes(b)) result.global.push(b);
      }
    }
  } catch (err) {
    console.debug('[Lorebook] Error reading global bound books:', err);
  }

  return result;
}

/**
 * 寻找可用的最小 UID
 */
export function getFreeUid(data: WorldInfoData): number {
  const existingUids = new Set(
    Object.keys(data.entries).map(k => Number(k)).filter(n => !Number.isNaN(n)),
  );
  let next = 0;
  while (existingUids.has(next)) {
    next++;
  }
  return next;
}

/**
 * 构造一个符合 ST 标准的空条目模版
 */
export function createEntryTemplate(uid: number): WorldInfoEntry {
  return {
    uid,
    key: [],
    keysecondary: [],
    comment: '新词条',
    content: '',
    constant: false,
    selective: true,
    selectiveLogic: 0,
    addMemo: false,
    order: 100,
    position: 0,
    disable: false,
    excludeRecursion: false,
    preventRecursion: false,
    delayUntilRecursion: 0,
    probability: 100,
    useProbability: true,
    depth: 4,
    group: '',
    groupOverride: false,
    groupWeight: 100,
    scanDepth: null,
    caseSensitive: null,
    matchWholeWords: null,
    useGroupScoring: null,
    automationId: '',
    role: 0,
    vectorized: false,
    sticky: 0,
    cooldown: 0,
    delay: 0,
    displayIndex: uid,
  };
}
