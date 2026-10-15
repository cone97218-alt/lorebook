/**
 * SillyTavern getContext() 的标准封装与 TypeScript 契约声明。
 * 所有触碰宿主的代码统一收敛在此处。
 */

export interface STMessage {
  name: string;
  is_user: boolean;
  is_system: boolean;
  mes: string;
  swipes?: string[];
  send_date?: string;
  swipe_id?: number;
  extra?: Record<string, unknown>;
}

export interface STEventSource {
  on(event: string, handler: (...args: any[]) => void): void;
  off?(event: string, handler: (...args: any[]) => void): void;
  emit?(event: string, ...args: any[]): Promise<void> | void;
}

export interface STEventTypes {
  USER_MESSAGE_RENDERED: string;
  CHARACTER_MESSAGE_RENDERED: string;
  MESSAGE_SENT: string;
  GENERATION_STARTED: string;
  GENERATION_ENDED: string;
  MESSAGE_SWIPED: string;
  MESSAGE_EDITED: string;
  MESSAGE_DELETED: string;
  MESSAGE_UPDATED: string;
  CHAT_CHANGED: string;
  [k: string]: string;
}

export interface STCharacter {
  name: string;
  avatar: string;
  [k: string]: unknown;
}

export interface STContext {
  chat: STMessage[];
  chatMetadata: Record<string, unknown>;
  name1: string;
  name2: string;
  characters?: STCharacter[];
  characterId?: string | number;
  groupId?: string;
  getCurrentChatId: () => string | undefined;
  getRequestHeaders: () => Record<string, string>;
  saveMetadataDebounced: () => void;
  saveMetadata: () => Promise<void>;
  saveChat: () => Promise<void>;
  extensionSettings?: Record<string, unknown>;
  saveSettingsDebounced?: () => void;
  reloadCurrentChat: () => Promise<void>;
  eventSource: STEventSource;
  eventTypes: STEventTypes;
  setExtensionPrompt?: (
    key: string,
    value: string,
    position: number,
    depth: number,
    scan?: boolean,
    role?: number,
    filter?: unknown,
  ) => void;
  executeSlashCommandsWithOptions?: (command: string, options?: Record<string, unknown>) => Promise<unknown>;
  substituteParams?: (content: string) => string;
  [k: string]: any;
}

interface STGlobal {
  getContext: () => STContext;
}

declare global {
  interface Window {
    SillyTavern?: STGlobal;
  }
}

/**
 * 取得 ST 上下文对象；未就绪时返回 null。
 */
export function getContext(): STContext | null {
  try {
    return window.SillyTavern?.getContext?.() ?? null;
  } catch {
    return null;
  }
}

/**
 * 把文本追加到 ST 主输入框，不触发发送。
 * 会主动派发 input 事件，同步 ST 的输入框高度、发送按钮和草稿状态。
 */
export function appendChatInput(text: string): boolean {
  try {
    const value = text.trim();
    const textarea = document.querySelector<HTMLTextAreaElement>('#send_textarea');
    if (!value || !textarea) return false;

    const existing = textarea.value;
    const separator = !existing
      ? ''
      : existing.endsWith('\n\n')
        ? ''
        : existing.endsWith('\n')
          ? '\n'
          : '\n\n';
    textarea.value = `${existing}${separator}${value}`;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    requestAnimationFrame(() => {
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 修改某条消息正文，并严格同步当前 swipe。
 * 避免只改 mes 导致与 swipes 数组分裂的 Bug。
 */
export function setMessageText(message: STMessage | undefined, text: string): void {
  if (!message) return;
  message.mes = text;
  if (!Array.isArray(message.swipes)) return;
  const idx = typeof message.swipe_id === 'number' ? message.swipe_id : 0;
  if (idx >= 0 && idx < message.swipes.length) {
    message.swipes[idx] = text;
  }
}
