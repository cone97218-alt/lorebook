type ToastType = 'info' | 'success' | 'warning' | 'error';

interface Toastr {
  info: (msg: string, title?: string) => void;
  success: (msg: string, title?: string) => void;
  warning: (msg: string, title?: string) => void;
  error: (msg: string, title?: string) => void;
}

/**
 * 轻量 Toast 提示，复用 ST 全局的 toastr。
 * 拿不到时安全降级回 console.log，绝不抛出异常。
 */
export function toast(message: string, type: ToastType = 'info', title = '世界书'): void {
  try {
    const t = (window as unknown as { toastr?: Toastr }).toastr;
    if (t && typeof t[type] === 'function') {
      t[type](message, title);
      return;
    }
  } catch {
    /* ignore */
  }
  console.log(`[${title}]`, message);
}
