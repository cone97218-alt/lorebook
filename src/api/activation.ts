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

/**
 * 获取上一轮生成命中的世界书条目列表
 */
export async function fetchLastActivation(): Promise<WorldInfoActivationBatch | null> {
  try {
    const api = window.__TAURITAVERN__?.api?.worldInfo;
    if (api?.getLastActivation) {
      return await api.getLastActivation();
    }
  } catch (err) {
    console.warn('[Activation] Failed to call getLastActivation:', err);
  }
  return null;
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
