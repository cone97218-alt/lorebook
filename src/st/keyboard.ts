const ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
const guardedRoots = new WeakSet<ShadowRoot>();

function pathContainsEditable(event: KeyboardEvent): boolean {
  return event.composedPath().some(node =>
    node instanceof HTMLInputElement ||
    node instanceof HTMLTextAreaElement ||
    node instanceof HTMLSelectElement ||
    (node instanceof HTMLElement && node.isContentEditable),
  );
}

/**
 * 拦截 Shadow DOM 内表单控件的方向键冒泡。
 * 阻止事件冒泡到 ST 全局快捷键（ST 用左右方向键翻阅 Swipe，上下方向键回溯输入历史）。
 * 只 stopPropagation，不 preventDefault，保证控件内部光标移动与选择不受影响。
 */
export function guardEditableArrowKeys(root: ShadowRoot): void {
  if (guardedRoots.has(root)) return;
  guardedRoots.add(root);

  root.addEventListener('keydown', event => {
    if (!(event instanceof KeyboardEvent) || !ARROW_KEYS.has(event.key)) return;
    // 放行带 Ctrl/Shift/Alt/Meta 的组合快捷键
    if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return;

    if (pathContainsEditable(event)) {
      event.stopPropagation();
    }
  });
}
