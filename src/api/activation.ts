export interface WorldInfoActivationEntry {
  world: string;
  uid: string | number;
  displayName: string;
  constant: boolean;
  position?:
    | 'before'
    | 'after'
    | 'an_top'
    | 'an_bottom'
    | 'depth'
    | 'em_top'
    | 'em_bottom'
    | 'outlet'
    | string;
  content?: string;
  tokens?: number;
}

export interface WorldInfoActivationBatch {
  timestampMs: number;
  trigger: string;
  entries: WorldInfoActivationEntry[];
}

declare global {
  interface Window {
    __TAURITAVERN__?: {
      ready?: Promise<void>;
      api?: {
        worldInfo?: {
          getLastActivation(): Promise<WorldInfoActivationBatch | null>;
          subscribeActivations(handler: (batch: WorldInfoActivationBatch) => void): Promise<() => void>;
          openEntry(ref: { world: string; uid: string | number }): Promise<{ opened: boolean }>;
        };
      };
    };
    __TAURITAVERN_MAIN_READY__?: Promise<void>;
  }
}

let cachedHostActivation: WorldInfoActivationBatch | null = null;

function estimateActivationTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x4e00 && code <= 0x9fa5) cjk++;
  }
  const nonCjk = text.length - cjk;
  return Math.ceil(cjk * 0.8 + nonCjk * 0.25);
}

/**
 * 缓存宿主 WORLD_INFO_ACTIVATED 事件上报的激活条目
 */
export function recordHostActivation(entriesList: unknown): WorldInfoActivationBatch {
  const arr = Array.isArray(entriesList) ? entriesList : [];
  const entries: WorldInfoActivationEntry[] = arr
    .filter((item): item is Record<string, any> => Boolean(item && typeof item === 'object'))
    .map(item => {
      const content = typeof item.content === 'string' ? item.content : '';
      const uid = item.uid ?? '';
      const world = String(item.world || item.book || item.worldName || '');
      const displayName = String(item.displayName || item.comment || (uid !== '' ? `#${uid}` : '未命名条目'));
      let posStr: string | undefined;
      if (typeof item.position === 'string') {
        posStr = item.position;
      } else if (typeof item.position === 'number') {
        if (item.position === 4) {
          const roleLabel = item.role === 1 ? 'D用户' : item.role === 2 ? 'Dai' : 'D系统';
          posStr = `${roleLabel} ${item.depth ?? 4}`;
        } else {
          const map: Record<number, string> = {
            0: '角色前',
            1: '角色后',
            2: '作者注释前',
            3: '作者注释后',
            5: '示例前',
            6: '示例后',
            7: '锚点',
          };
          posStr = map[item.position];
        }
      }
      return {
        world,
        uid,
        displayName,
        constant: Boolean(item.constant),
        position: posStr,
        content: content || undefined,
        tokens: content ? estimateActivationTokens(content) : (typeof item.tokens === 'number' ? item.tokens : undefined),
      };
    });

  const batch: WorldInfoActivationBatch = {
    timestampMs: Date.now(),
    trigger: 'WORLD_INFO_ACTIVATED',
    entries,
  };
  cachedHostActivation = batch;
  return batch;
}

/**
 * 获取上一轮生成命中的世界书条目列表
 */
export async function fetchLastActivation(): Promise<WorldInfoActivationBatch | null> {
  try {
    const api = window.__TAURITAVERN__?.api?.worldInfo;
    if (api?.getLastActivation) {
      const tauriBatch = await api.getLastActivation();
      if (tauriBatch) {
        if (!cachedHostActivation || tauriBatch.timestampMs >= cachedHostActivation.timestampMs) {
          return tauriBatch;
        }
      }
    }
  } catch (err) {
    console.warn('[Activation] Failed to call getLastActivation:', err);
  }
  return cachedHostActivation;
}

/**
 * 订阅实时激活通知
 */
export async function listenActivations(
  onBatch: (batch: WorldInfoActivationBatch) => void,
): Promise<(() => void) | null> {
  try {
    const api = window.__TAURITAVERN__?.api?.worldInfo;
    if (api?.subscribeActivations) {
      return await api.subscribeActivations(onBatch);
    }
  } catch (err) {
    console.warn('[Activation] Failed to subscribe to activations:', err);
  }
  return null;
}
