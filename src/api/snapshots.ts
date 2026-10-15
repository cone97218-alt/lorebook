import type { WorldInfoData } from './lorebook';

export interface WorldBookSnapshot {
  id: string;
  name: string;
  bookName: string;
  createdAt: number;
  activeCount: number;
  totalCount: number;
  states: Record<number, boolean>; // uid -> disable
}

const STORAGE_PREFIX = 'st_fluent_lorebook_snapshots:';

function getStorageKey(bookName: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(bookName.trim())}`;
}

export function loadSnapshots(bookName: string): WorldBookSnapshot[] {
  if (!bookName) return [];
  try {
    const raw = localStorage.getItem(getStorageKey(bookName));
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error('[Snapshots] Failed to load snapshots:', err);
    return [];
  }
}

export function saveSnapshotList(bookName: string, list: WorldBookSnapshot[]): void {
  if (!bookName) return;
  try {
    localStorage.setItem(getStorageKey(bookName), JSON.stringify(list));
  } catch (err) {
    console.error('[Snapshots] Failed to persist snapshots:', err);
  }
}

export function createSnapshot(bookName: string, snapshotName: string, data: WorldInfoData): WorldBookSnapshot {
  const list = loadSnapshots(bookName);
  const states: Record<number, boolean> = {};
  let activeCount = 0;
  let totalCount = 0;

  for (const [uidStr, entry] of Object.entries(data.entries)) {
    const uid = Number(uidStr);
    const isDisabled = Boolean(entry.disable);
    states[uid] = isDisabled;
    totalCount++;
    if (!isDisabled) activeCount++;
  }

  const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  const snapshot: WorldBookSnapshot = {
    id,
    name: snapshotName.trim() || `快照 ${list.length + 1}`,
    bookName,
    createdAt: Date.now(),
    activeCount,
    totalCount,
    states,
  };

  list.unshift(snapshot);
  saveSnapshotList(bookName, list);
  return snapshot;
}

export function deleteSnapshot(bookName: string, id: string): boolean {
  const list = loadSnapshots(bookName);
  const idx = list.findIndex(s => s.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  saveSnapshotList(bookName, list);
  return true;
}

export function applySnapshot(snapshot: WorldBookSnapshot, data: WorldInfoData): boolean {
  if (!snapshot || !data?.entries) return false;
  let changed = false;

  for (const [uidStr, entry] of Object.entries(data.entries)) {
    const uid = Number(uidStr);
    if (uid in snapshot.states) {
      const targetDisable = snapshot.states[uid];
      if (entry.disable !== targetDisable) {
        entry.disable = targetDisable;
        changed = true;
      }
    }
  }

  return changed;
}

export interface SnapshotDiff {
  toEnable: number[]; // 当前停用，快照中启用
  toDisable: number[]; // 当前启用，快照中停用
  identical: boolean;
}

/**
 * 对比当前世界书开启状态与快照的差异
 */
export function compareSnapshot(snapshot: WorldBookSnapshot, data: WorldInfoData): SnapshotDiff {
  const toEnable: number[] = [];
  const toDisable: number[] = [];

  if (!snapshot || !data?.entries) {
    return { toEnable, toDisable, identical: true };
  }

  for (const [uidStr, entry] of Object.entries(data.entries)) {
    const uid = Number(uidStr);
    const currentDisabled = Boolean(entry.disable);
    const snapDisabled = snapshot.states[uid] ?? currentDisabled;

    if (currentDisabled && !snapDisabled) {
      toEnable.push(uid);
    } else if (!currentDisabled && snapDisabled) {
      toDisable.push(uid);
    }
  }

  return {
    toEnable,
    toDisable,
    identical: toEnable.length === 0 && toDisable.length === 0,
  };
}

/**
 * 使用当前条目启闭状态覆盖指定的快照
 */
export function overwriteSnapshot(snapshotId: string, bookName: string, data: WorldInfoData): boolean {
  const list = loadSnapshots(bookName);
  const snap = list.find(s => s.id === snapshotId);
  if (!snap || !data?.entries) return false;

  const states: Record<number, boolean> = {};
  let activeCount = 0;
  let totalCount = 0;

  for (const [uidStr, entry] of Object.entries(data.entries)) {
    const uid = Number(uidStr);
    const isDisabled = Boolean(entry.disable);
    states[uid] = isDisabled;
    totalCount++;
    if (!isDisabled) activeCount++;
  }

  snap.states = states;
  snap.activeCount = activeCount;
  snap.totalCount = totalCount;
  snap.createdAt = Date.now();

  saveSnapshotList(bookName, list);
  return true;
}
