import { ref } from 'vue';

export interface HistoryItem {
  id: string;
  time: string;
  desc: string;
  undo: () => void | Promise<void>;
  undone?: boolean;
}

const MAX_HISTORY = 20;

export const historyList = ref<HistoryItem[]>([]);

function formatTime(d = new Date()): string {
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function recordAction(desc: string, undo: () => void | Promise<void>): void {
  const item: HistoryItem = {
    id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    time: formatTime(),
    desc,
    undo,
    undone: false,
  };
  historyList.value.unshift(item);
  if (historyList.value.length > MAX_HISTORY) {
    historyList.value.pop();
  }
}

export async function undoAction(id: string): Promise<boolean> {
  const item = historyList.value.find(h => h.id === id);
  if (!item || item.undone) return false;
  try {
    await item.undo();
    item.undone = true;
    return true;
  } catch (err) {
    console.error('[Lorebook History] Undo failed:', err);
    return false;
  }
}

export function clearHistory(): void {
  historyList.value = [];
}
