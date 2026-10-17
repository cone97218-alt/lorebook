import { openApp } from '@/state/ui';
import { selectWorldBook } from '@/state/lorebook';
import { getContext } from '@/st/context';
import { getHostWorldInfo } from '@/api/lorebook';

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
 * 拦截酒馆原生世界书按钮，点击时直接唤起本插件面板并定位至目标世界书
 */
export function initNativeWorldBookInterceptor(getEnabled: () => boolean): void {
  if (nativeInterceptorAttached) return;
  nativeInterceptorAttached = true;

  // 1. 全局拦截原生世界书相关点击事件
  document.addEventListener(
    'click',
    (e: MouseEvent) => {
      if (!getEnabled()) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // 命中原生顶部世界书按钮图标或其切换器
      const isNativeTopBtn = target.closest('#WI-SP-button .drawer-toggle, #WIDrawerIcon');
      if (isNativeTopBtn) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        openApp('lorebook');
        return;
      }

      // 命中角色卡世界书按钮 (#world_button)
      const isCharWorldBtn = target.closest('#world_button');
      if (isCharWorldBtn && !e.shiftKey && !e.altKey) {
        const ctx = getContext();
        const chid = $('#set_character_world').data('chid') ?? ctx?.characterId;
        const characters = ctx?.characters || (window as any).characters;
        const char = chid !== undefined && characters ? characters[chid as any] : null;
        const worldName = (char as any)?.data?.extensions?.world || (char as any)?.world;
        if (worldName && typeof worldName === 'string') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          void selectWorldBook(worldName);
          openApp('lorebook');
          return;
        }
      }

      // 命中当前会话世界书按钮 (.chat_lorebook_button)
      const isChatWorldBtn = target.closest('.chat_lorebook_button');
      if (isChatWorldBtn && !e.shiftKey && !e.altKey) {
        const ctx = getContext();
        const chatWi = ctx?.chatMetadata?.world_info;
        const worldName = typeof chatWi === 'string' ? chatWi : (Array.isArray(chatWi) ? chatWi[0] : null);
        if (worldName) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          void selectWorldBook(worldName);
          openApp('lorebook');
          return;
        }
      }
    },
    true, // 捕获阶段拦截，先于酒馆原生展开事件执行
  );

  // 2. 挂钩 hostWI.openWorldInfoEditor，捕获由酒馆内核直接触发的打开世界书行为
  void getHostWorldInfo().then(hostWI => {
    if (hostWI && typeof hostWI.openWorldInfoEditor === 'function') {
      const originalOpen = hostWI.openWorldInfoEditor;
      hostWI.openWorldInfoEditor = function (worldName: string) {
        if (getEnabled()) {
          if (worldName) {
            void selectWorldBook(worldName);
          }
          openApp('lorebook');
          return;
        }
        return originalOpen.apply(this, arguments);
      };
    }
  }).catch(() => {});
}

