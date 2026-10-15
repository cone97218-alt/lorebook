import { openApp } from '@/state/ui';

const MENU_ITEM_ID = 'fluent-lorebook-menu-item';
const DRAWER_BTN_ID = 'open-fluent-lorebook-drawer-btn';

/**
 * 在 ST 魔杖扩展菜单 (#extensionsMenu) 中注入扩展入口。
 */
export function injectMenuButton(title = '流畅世界书'): void {
  const tryInject = () => {
    const $menu = $('#extensionsMenu');
    if ($menu.length === 0) return false;
    if ($(`#${MENU_ITEM_ID}`).length > 0) return true;

    const $item = $(`
      <div class="extension_container interactable" tabindex="0">
        <a id="${MENU_ITEM_ID}" class="list-group-item" href="#" title="${title}">
          <i class="fa-solid fa-book-bookmark"></i>
          <span>${title}</span>
        </a>
      </div>
    `);

    $item.on('click', (e: { preventDefault: () => void }) => {
      e.preventDefault();
      openApp('lorebook');
      $('#extensionsMenu').hide();
    });

    $menu.append($item);
    return true;
  };

  if (tryInject()) return;
  let attempts = 0;
  const timer = setInterval(() => {
    if (tryInject() || ++attempts > 40) clearInterval(timer);
  }, 500);
}

/**
 * 在 ST 原生世界书抽屉 (#world_popup) 内注入「打开流畅编辑器」快捷按钮
 */
export function injectWorldDrawerButton(): void {
  const tryInject = () => {
    const $container = $('#world_popup .flex-container:first');
    if ($container.length === 0) return false;
    if ($(`#${DRAWER_BTN_ID}`).length > 0) return true;

    const $btn = $(`
      <div id="${DRAWER_BTN_ID}" class="menu_button menu_button_icon" style="background: rgba(34, 139, 230, 0.2); border: 1px solid var(--SmartThemeHighlightColor, #228be6); color: var(--SmartThemeHighlightColor, #228be6);" title="Fluent Lorebook">
        <i class="fa-solid fa-feather-pointed"></i>
      </div>
    `);

    $btn.on('click', (e: { preventDefault: () => void }) => {
      e.preventDefault();
      openApp('lorebook');
    });

    $container.prepend($btn);
    return true;
  };

  if (tryInject()) return;
  let attempts = 0;
  const timer = setInterval(() => {
    if (tryInject() || ++attempts > 60) clearInterval(timer);
  }, 500);
}

export function syncWorldDrawerButton(show: boolean): void {
  $(`#${DRAWER_BTN_ID}`).toggle(show);
}
