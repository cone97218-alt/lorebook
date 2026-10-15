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
 * 获取所有世界书名称列表
 */
export async function fetchWorldBookList(): Promise<string[]> {
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
 */
export async function fetchWorldBookData(name: string): Promise<WorldInfoData | null> {
  if (!name) return null;
  try {
    const res = await fetch('/api/worldinfo/get', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name }),
      cache: 'no-cache',
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data !== 'object') return null;
    if (!data.entries || typeof data.entries !== 'object') {
      data.entries = {};
    }
    return data as WorldInfoData;
  } catch (err) {
    console.error(`[Lorebook] Failed to load worldbook: ${name}`, err);
    return null;
  }
}

/**
 * 保存世界书并通知 ST 宿主刷新缓存与事件
 */
export async function saveWorldBookData(name: string, data: WorldInfoData): Promise<boolean> {
  if (!name || !data) return false;
  try {
    const ctx = getContext();

    // 1. 优先调用宿主原生 saveWorldInfo，确保 SillyTavern 的 in-memory worldInfoCache 立即更新
    let saved = false;
    if (typeof ctx?.saveWorldInfo === 'function') {
      try {
        await ctx.saveWorldInfo(name, data, true);
        saved = true;
      } catch (err) {
        console.warn('[Lorebook] ctx.saveWorldInfo call failed, falling back to fetch', err);
      }
    }

    if (!saved) {
      const res = await fetch('/api/worldinfo/edit', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ name, data }),
      });
      if (!res.ok) return false;
    }

    // 2. 刷新宿主原生世界书列表与编辑抽屉
    if (typeof ctx?.updateWorldInfoList === 'function') {
      try {
        await ctx.updateWorldInfoList();
      } catch {
        /* ignore */
      }
    }

    if (typeof ctx?.reloadWorldInfoEditor === 'function') {
      try {
        await ctx.reloadWorldInfoEditor();
      } catch {
        /* ignore */
      }
    }

    // 3. 触发 ST 宿主事件，通知其缓存已同步
    if (ctx?.eventSource?.emit) {
      const eventName = ctx.eventTypes?.WORLDINFO_UPDATED || 'worldinfo_updated';
      void ctx.eventSource.emit(eventName, name, data);
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
    const res = await fetch('/api/worldinfo/delete', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return false;

    // 1. 同步更新宿主原生世界书列表
    if (typeof ctx?.updateWorldInfoList === 'function') {
      try {
        await ctx.updateWorldInfoList();
      } catch {
        /* ignore */
      }
    }

    // 2. 直接清理原生 DOM 选单项以确保酒馆原生界面立即反映消失
    try {
      document.querySelectorAll<HTMLOptionElement>('#world_info option, #world_editor_select option, #character_world option')
        .forEach((el) => {
          if (el.textContent === name || el.value === name) {
            el.remove();
          }
        });
      $('#world_editor_select').trigger('change');
    } catch {
      /* ignore */
    }

    // 3. 刷新宿主原生世界书编辑器
    if (typeof ctx?.reloadWorldInfoEditor === 'function') {
      try {
        await ctx.reloadWorldInfoEditor();
      } catch {
        /* ignore */
      }
    }

    // 4. 触发宿主设置已变更事件
    if (ctx?.eventSource?.emit) {
      const eventName = ctx.eventTypes?.WORLDINFO_SETTINGS_UPDATED || 'worldinfo_settings_updated';
      void ctx.eventSource.emit(eventName);
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
