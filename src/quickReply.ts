import { openApp } from '@/state/ui';

const BTN_ID = 'my-ext-qr-button';
let pollTimer: ReturnType<typeof setInterval> | null = null;
let observer: MutationObserver | null = null;

function ensureButtonHolder(sendForm: HTMLElement): HTMLElement {
  let bar = Array.from(sendForm.querySelectorAll('div')).find(d => d.id === 'qr--bar') as HTMLElement | undefined;
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'qr--bar';
    bar.className = 'flex-container flexGap5';
    sendForm.prepend(bar);
  }
  let holder = bar.querySelector('.qr--buttons') as HTMLElement | null;
  if (!holder) {
    holder = document.createElement('div');
    holder.className = 'qr--buttons';
    bar.appendChild(holder);
  }
  return holder;
}

function buildButton(title = '打开扩展'): HTMLElement {
  const btn = document.createElement('div');
  btn.id = BTN_ID;
  btn.className = 'qr--button menu_button interactable';
  btn.setAttribute('tabindex', '0');
  btn.title = title;

  const icon = document.createElement('i');
  icon.className = 'qr--button-icon fa-solid fa-puzzle-piece';
  btn.appendChild(icon);

  btn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    openApp();
  });
  return btn;
}

function tryInject(title?: string): boolean {
  const sendForm = document.getElementById('send_form');
  if (!sendForm) return false;
  if (document.getElementById(BTN_ID)) return true;

  const holder = ensureButtonHolder(sendForm);
  holder.appendChild(buildButton(title));
  return true;
}

function removeButton(): void {
  document.getElementById(BTN_ID)?.remove();
}

function startObserver(title?: string): void {
  if (observer) return;
  const sendForm = document.getElementById('send_form');
  if (!sendForm) return;
  observer = new MutationObserver(() => {
    if (!document.getElementById(BTN_ID)) tryInject(title);
  });
  observer.observe(sendForm, { childList: true, subtree: true });
}

function stopObserver(): void {
  observer?.disconnect();
  observer = null;
}

export function syncQuickReplyButton(enabled: boolean, title = '打开扩展'): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (!enabled) {
    stopObserver();
    removeButton();
    return;
  }
  if (tryInject(title)) {
    startObserver(title);
    return;
  }

  let attempts = 0;
  pollTimer = setInterval(() => {
    if (tryInject(title) || ++attempts > 40) {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      if (document.getElementById(BTN_ID)) startObserver(title);
    }
  }, 500);
}
