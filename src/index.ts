import { createApp, watch } from 'vue';
import App from '@/App.vue';
import { hydrateSettings } from '@/api/settings';
import { getContext } from '@/st/context';
import { guardEditableArrowKeys } from '@/st/keyboard';
import { injectMenuButton, injectWorldDrawerButton, syncWorldDrawerButton } from '@/menu';
import { syncTopBarButton, initNativeWorldBookInterceptor } from '@/topbar';
import { syncQuickReplyButton } from '@/quickReply';
import { registerPublicInterface } from '@/public/register';
import { ui } from '@/state/ui';
import { lorebookState, selectWorldBook } from '@/state/lorebook';
import { versionedAssetUrl } from '@/version';

// 样式打包
import '@/styles/base.css';
import '@/styles/theme.css';

const HOST_ID = 'my-extension-host';

/**
 * 钉死可继承排版属性，彻底切断宿主全局样式通过继承穿透进 Shadow DOM
 */
const INHERITED_RESET: Record<string, string> = {
  'font-family': 'inherit',
  'font-size': '14px',
  'font-weight': '400',
  'font-style': 'normal',
  'line-height': '1.6',
  'letter-spacing': 'normal',
  'text-align': 'left',
  'text-transform': 'none',
  'text-indent': '0',
  'white-space': 'normal',
  'color': '#1c242c',
  'direction': 'ltr',
};

function mount(): void {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    document.body.appendChild(host);
  }

  host.style.setProperty('display', 'contents', 'important');
  for (const [prop, value] of Object.entries(INHERITED_RESET)) {
    host.style.setProperty(prop, value, 'important');
  }

  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  shadow.textContent = '';
  
  // 注入方向键冒泡拦截，保护表单输入不触发 ST 的 Swipe 翻页
  guardEditableArrowKeys(shadow);

  // 注入 FontAwesome 样式表进入 Shadow Root，确保图标正常显示
  const hostLinks = document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]');
  let injectedFa = false;
  hostLinks.forEach(l => {
    const href = l.getAttribute('href') || l.href;
    if (href && (href.includes('fontawesome') || href.includes('solid') || href.includes('brands'))) {
      const clone = document.createElement('link');
      clone.rel = 'stylesheet';
      clone.href = l.href;
      shadow.appendChild(clone);
      injectedFa = true;
    }
  });

  if (!injectedFa) {
    for (const path of ['/css/fontawesome.min.css', '/css/solid.min.css', '/css/brands.min.css']) {
      const fallback = document.createElement('link');
      fallback.rel = 'stylesheet';
      fallback.href = path;
      shadow.appendChild(fallback);
    }
  }

  // 动态引入样式表到 Shadow Root
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = versionedAssetUrl('./index.css', import.meta.url);
  shadow.appendChild(link);

  const container = document.createElement('div');
  shadow.appendChild(container);

  const app = createApp(App);
  app.mount(container);

  $(window).on('pagehide', () => app.unmount());
}

/**
 * 宿主事件与生命周期管理
 */
function bindLifecycleEvents(): void {
  const ctx = getContext();
  if (!ctx?.eventSource || !ctx?.eventTypes) return;

  const { eventSource: es, eventTypes: et } = ctx;

  es.on(et.CHAT_CHANGED, () => {
    console.log('[MyExtension] 聊天已切换，重载数据');
  });

  es.on(et.USER_MESSAGE_RENDERED, () => {
    console.log('[MyExtension] 用户消息已渲染');
  });

  es.on(et.CHARACTER_MESSAGE_RENDERED, () => {
    console.log('[MyExtension] 角色消息已渲染');
  });

  es.on(et.WORLDINFO_UPDATED, (bookName: string) => {
    if (bookName && lorebookState.currentBook === bookName) {
      if (!lorebookState.isSaving && !lorebookState.isDirty) {
        void selectWorldBook(bookName, true);
      }
    }
  });
}

function bindWhenReady(attempt = 0): void {
  if (window.SillyTavern?.getContext) {
    try {
      console.log('[MyExtension] 宿主环境已就绪，开始初始化');
      hydrateSettings();
      void registerPublicInterface();
      bindLifecycleEvents();
      console.log('[MyExtension] 初始化完成');
    } catch (e) {
      console.error('[MyExtension] 初始化异常', e);
    }
    return;
  }
  if (attempt > 40) return;
  setTimeout(() => bindWhenReady(attempt + 1), 500);
}

// 启动入口
$(() => {
  mount();
  injectMenuButton('流畅世界书');
  injectWorldDrawerButton();
  syncWorldDrawerButton(ui.showWorldDrawerBtn);
  watch(() => ui.showWorldDrawerBtn, on => syncWorldDrawerButton(on));

  syncTopBarButton(ui.showTopBar, '流畅世界书');
  watch(() => ui.showTopBar, on => syncTopBarButton(on, '流畅世界书'));

  initNativeWorldBookInterceptor(() => ui.replaceNativeWorldBook);

  syncQuickReplyButton(ui.showQuickReply, '流畅世界书');
  watch(() => ui.showQuickReply, on => syncQuickReplyButton(on, '流畅世界书'));

  bindWhenReady();
});
