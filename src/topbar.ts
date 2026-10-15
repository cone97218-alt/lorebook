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

let nativeInterceptorAttached = false;

/**
 * 拦截酒馆原生世界书按钮，点击时直接唤起本插件面板
 */
export function initNativeWorldBookInterceptor(getEnabled: () => boolean): void {
  if (nativeInterceptorAttached) return;
  nativeInterceptorAttached = true;

  document.addEventListener(
    'click',
    (e: MouseEvent) => {
      if (!getEnabled()) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // 命中原生顶部世界书按钮图标或其切换器
      const isNativeBtn = target.closest('#WI-SP-button .drawer-toggle, #WIDrawerIcon');
      if (isNativeBtn) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        openApp('lorebook');
      }
    },
    true, // 捕获阶段拦截，先于酒馆原生展开事件执行
  );
}

