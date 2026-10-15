import { openApp } from '@/state/ui';

const BTN_ID = 'my-ext-topbar-button';
let pollTimer: ReturnType<typeof setInterval> | null = null;

function buildButton(title = '新扩展'): HTMLElement {
  const btn = document.createElement('div');
  btn.id = BTN_ID;
  btn.className = 'drawer';
  btn.innerHTML = `
    <div class="drawer-toggle">
      <div class="drawer-icon fa-solid fa-puzzle-piece fa-fw closedIcon" title="${title}"></div>
    </div>
  `;
  btn.querySelector('.drawer-toggle')?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    openApp();
  });
  return btn;
}

function tryInject(title?: string): boolean {
  const holder = document.getElementById('top-settings-holder');
  if (!holder) return false;
  if (document.getElementById(BTN_ID)) return true;

  const btn = buildButton(title);
  const persona = document.getElementById('persona-management-button');
  if (persona) persona.before(btn);
  else holder.appendChild(btn);
  return true;
}

function removeButton(): void {
  document.getElementById(BTN_ID)?.remove();
}

/**
 * 根据开关同步注入/移除顶栏按钮
 */
export function syncTopBarButton(enabled: boolean, title = '新扩展'): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (!enabled) {
    removeButton();
    return;
  }
  if (tryInject(title)) return;

  let attempts = 0;
  pollTimer = setInterval(() => {
    if (tryInject(title) || ++attempts > 40) {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    }
  }, 500);
}
