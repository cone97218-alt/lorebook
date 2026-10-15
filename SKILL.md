---
name: sillytavern-extension-framework
description: SillyTavern 现代化第三方扩展开发通用工程架构与复用规范指南（Vue 3 + TypeScript + Vite + Shadow DOM）
---

# SillyTavern 现代化第三方扩展开发通用工程规范与架构指南

本指南提炼自成熟高可用插件的底层架构体系，剥离一切具体业务逻辑，总结出一套专门用于开发任何功能各异（如工作流编排、独立 UI 面板、世界书强化、状态监控、自动化等）的 SillyTavern（酒馆）扩展的标准化工程架构与底层模式。

---

## 一、核心设计哲学与技术选型

现代 SillyTavern 插件面临的主要痛点包括：
1. **宿主样式污染与被污染**：ST 界面充满全局 CSS 类与各种主题定制，传统轻量注入极易发生样式错乱，或改坏宿主外观。
2. **快捷键冲突**：ST 监听了全局左右键（切换 Swipe）、上下键（翻阅输入历史），表单输入极其脆弱。
3. **设置丢失与多端不同步**：滥用 `localStorage` 导致手机与电脑不互通；初始化过早导致默认值反向覆盖服务器存储。
4. **生成时序与卡死风险**：缺乏对 AI 补全时序、取消、并发、拦截器的精细控制，导致请求卡死或与主回复打架。

### 技术选型矩阵
- **框架**：Vue 3 Composition API (`<script setup lang="ts">`) + 响应式 `reactive` / `ref`
- **构建工具**：Vite + `@vitejs/plugin-vue` + `vue-tsc`
- **语言**：TypeScript (严格模式)
- **UI 隔离**：**Shadow DOM (Open Mode)** + CSS Custom Properties (Tokens)
- **依赖处理**：通过 Rollup 插件将宿主全局脚本（jQuery, Toastr, Lodash, ST scripts）标记为 `external`，并以 ES Module 相对路径加载。

---

## 二、标准目录结构

一个标准、高扩展性的插件工程推荐目录结构如下：

```
my-extension/
├── package.json               # 依赖配置与构建脚本
├── tsconfig.json              # TS 配置与路径映射
├── vite.config.ts             # Vite 配置（含 ST 模块相对解析插件）
├── manifest.json              # 插件元信息与拦截器声明
├── scripts/
│   └── sync-version.mjs       # 版本号自动同步脚本（package.json -> manifest.json）
├── dist/                      # 编译产物（必须构建并纳入提交，index.js & index.css）
└── src/
    ├── index.ts               # 插件主入口、启动链、Shadow DOM 挂载
    ├── globals.d.ts           # 编译期常量声明
    ├── version.ts             # 运行时版本与资源路径辅助
    ├── st/                    # 宿主桥接层（单点解耦）
    │   ├── context.ts         # getContext() 封装与类型定义、常用 DOM 操作
    │   ├── keyboard.ts        # 方向键冒泡拦截器（防 Swipe 冲突）
    │   ├── toast.ts           # 宿主 toastr 弹窗优雅降级封装
    │   └── upload.ts          # 宿主 REST API 文件/图片压缩上传
    ├── api/                   # 数据持久化与后端通信
    │   ├── settings.ts        # 全局配置、跨端同步、Hydration Gate、多插件事件总线
    │   └── client.ts          # AI 端点通信包装（主 API / 副 API）
    ├── state/                 # 全局 UI 状态
    │   └── ui.ts              # 窗口开闭、主题、导航模式、弹窗 Teleport 挂载点
    ├── styles/                # 样式系统
    │   ├── base.css           # 基础布局、排版、滚动条、遮罩
    │   └── theme.css          # Design Tokens 变量定义（主题切换）
    ├── components/            # 通用原子 UI 组件
    │   ├── ModalMask.vue      # 统一弹窗遮罩（带 iOS Safari 修复与进出场过渡）
    │   ├── ConfirmDialog.vue  # 二次确认框
    │   ├── FloatingOrb.vue    # 边缘贴边悬浮球
    │   └── Icon.vue           # SVG 图标库
    ├── public/                # 对外暴露公共接口（插件间协同）
    │   ├── register.ts        # 注册全局 API、广播 Event、注册 SlashCommand 与 Macro
    │   └── types.ts           # 公共接口类型契约
    └── App.vue                # 插件主应用根容器（多页切换、移动端手势、ESC 关闭）
```

---

## 三、工程构建与打包规范

### 1. `vite.config.ts` 的核心实现
插件运行于浏览器端，加载路径一般为 `/scripts/extensions/third-party/<name>/dist/index.js`。若想直接 `import` 宿主的工具函数而不将其打包进 bundle，需要计算出到 ST `public/` 根目录的相对路径：

```typescript
import vue from '@vitejs/plugin-vue';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

// 计算从 dist/ 到 SillyTavern public/ 的相对路径（例如 ../../../../../scripts/xxx.js）
const relative_sillytavern_path = path.relative(
  path.join(__dirname, 'dist'),
  __dirname.substring(0, __dirname.lastIndexOf('public') + 'public'.length),
);

// ST 宿主已经挂载在 window 上的库，直接映射，避免重复打包
const globals: Record<string, string> = {
  jquery: '$',
  lodash: '_',
  toastr: 'toastr',
};

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

export default defineConfig(({ mode }) => ({
  define: {
    __PLUGIN_VERSION__: JSON.stringify(pkg.version ?? '1.0.0'),
  },
  plugins: [
    vue(),
    {
      name: 'sillytavern-resolver',
      enforce: 'pre',
      resolveId(id) {
        // 支持 import { ... } from '@sillytavern/scripts/extensions.js'
        if (id.startsWith('@sillytavern/')) {
          return {
            id: path.join(relative_sillytavern_path, id.replace('@sillytavern/', '')).replaceAll('\\', '/') + '.js',
            external: true,
          };
        }
        if (id in globals) {
          return { id, external: true };
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      input: 'src/index.ts',
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: '[name].[hash].chunk.js',
        assetFileNames: '[name].[ext]',
        globals,
      },
      external: id => id in globals,
    },
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: mode === 'production' ? true : 'inline',
    minify: mode === 'production',
    target: 'esnext',
  },
}));
```

### 2. `scripts/sync-version.mjs` 版本号同步
保证每次打包前，自动将 `package.json` 中的 `version` 刷入 `manifest.json`，并附加在 `js` 的 url 参数中实现 Cache-busting：

```javascript
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const manifestPath = path.join(root, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

const version = String(pkg.version ?? '').trim();
manifest.version = version;
manifest.js = `dist/index.js?ver=${encodeURIComponent(version)}`;

await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
```

---

## 四、UI 与 Shadow DOM 挂载规范

### 1. 深度样式隔离与继承切断
Shadow DOM 默认仍会继承可继承的文本排版属性（如 `font-family`, `line-height`, `color` 等）。为避免宿主第三方美化 CSS 渗透：
- Host 节点设为 `display: contents !important;`（不参与宿主布局）；
- 在 Host 上用内联 `!important` 钉死 15 项可继承排版属性；
- 构建产物的 `index.css` 通过 `<link>` 动态注入进入 Shadow Root；
- 内部所有样式使用 `--myext-*` 命名空间下的 CSS 变量。

```typescript
const INHERITED_RESET: Record<string, string> = {
  'font-family': "'MiSans','PingFang SC','Microsoft YaHei',-apple-system,sans-serif",
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

export function mountApp(rootId = 'my-extension-host') {
  let host = document.getElementById(rootId);
  if (!host) {
    host = document.createElement('div');
    host.id = rootId;
    document.body.appendChild(host);
  }

  host.style.setProperty('display', 'contents', 'important');
  for (const [prop, val] of Object.entries(INHERITED_RESET)) {
    host.style.setProperty(prop, val, 'important');
  }

  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  shadow.textContent = '';
  
  // 注入快捷键防冒泡屏障
  guardEditableArrowKeys(shadow);

  // 注入样式表（保证相对路径部署无关）
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./index.css', import.meta.url).href;
  shadow.appendChild(link);

  const container = document.createElement('div');
  shadow.appendChild(container);

  const app = createApp(App);
  app.mount(container);
}
```

### 2. 方向键冒泡屏障 (`guardEditableArrowKeys`)
在 Shadow Root 捕获 keydown 事件。如果在编辑表单（input/textarea/select/contentEditable）中按了方向键，**只终止冒泡（`stopPropagation`），不阻止默认行为（`preventDefault`）**。这样既保证了光标正常移动，又防止 ST 切换 Swipe：

```typescript
const ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

export function guardEditableArrowKeys(root: ShadowRoot): void {
  root.addEventListener('keydown', event => {
    if (!(event instanceof KeyboardEvent) || !ARROW_KEYS.has(event.key)) return;
    if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return;

    const isEditable = event.composedPath().some(node =>
      node instanceof HTMLInputElement ||
      node instanceof HTMLTextAreaElement ||
      node instanceof HTMLSelectElement ||
      (node instanceof HTMLElement && node.isContentEditable),
    );

    if (isEditable) {
      event.stopPropagation();
    }
  });
}
```

### 3. iOS Safari 弹窗 Teleport 陷阱与宿主方案
- ❌ **严禁 `<Teleport to="body">`**：一旦将弹窗送到 `document.body`，就脱离了 Shadow DOM，无法获取 scoped 样式与 `--myext-*` 变量，弹窗变成完全无样式的白板或被遮罩遮挡。
- ❌ **直接在可滚动容器内 `position: fixed`**：在 iOS Safari 下，可滚动祖先内的 `fixed` 元素会相对滚动内容而不是视口定位，导致页面滚动后弹窗被顶到屏幕外。
- ✅ **最佳方案**：在 Shadow DOM 的根元素直接子级（在 `.app-body` 滚动容器外部）创建一个 `<div ref="modalHost"></div>`。弹窗组件统一 `<Teleport :to="modalHost">`。既在 Shadow DOM 内部，又不受滚动容器影响！

---

## 五、数据持久化与跨端多层存储规范

| 存储层级 | 存储载体 | 特性与用途 | 保存方法 |
|---|---|---|---|
| **全局插件设置** | `getContext().extensionSettings['my_ext']` | 写入服务端 `settings.json`，**跨设备/多端实时同步** | `getContext().saveSettingsDebounced()` |
| **会话私有元数据** | `getContext().chatMetadata['my_ext']` | 随单场对话文件保存，换聊天自动隔离 | `getContext().saveMetadataDebounced()` |
| **消息私有状态** | `message.extra['my_ext']` | 随消息持久化，翻页（Swipe）天然跟随 | `getContext().saveChat()` |
| **设备本地临时态** | `localStorage` | 仅用于记录本机临时 UI 状态（如当前激活 Tab、悬浮球屏幕坐标） | `localStorage.setItem()` |

### 安全水合守卫（Hydration Gate）规范
在 Vue 响应式状态与持久化配置之间建立严格的“守卫模式”，**必须在服务端配置拉取完毕后才允许触发 watch 回写**：

```typescript
export const pluginSettings = reactive(defaultSettings());
let isHydrated = false;

// 1. 初始化水合：从 extensionSettings 加载
export function hydrateSettings() {
  if (isHydrated) return;
  const ctx = getContext();
  if (!ctx?.extensionSettings) return;

  const remote = ctx.extensionSettings['my_ext'];
  if (remote && typeof remote === 'object') {
    Object.assign(pluginSettings, normalize(remote));
  } else {
    // 兼容迁移：初次安装或从旧版迁移
    ctx.extensionSettings['my_ext'] = JSON.parse(JSON.stringify(pluginSettings));
    ctx.saveSettingsDebounced?.();
  }
  isHydrated = true;
}

// 2. 深度监听回写：未水合前严禁回写，防止默认配置覆盖服务端配置
watch(
  pluginSettings,
  () => {
    if (!isHydrated) return;
    const ctx = getContext();
    if (!ctx?.extensionSettings) return;
    ctx.extensionSettings['my_ext'] = JSON.parse(JSON.stringify(pluginSettings));
    ctx.saveSettingsDebounced?.();
  },
  { deep: true },
);
```

### 媒体文件上传规范
严禁将 Base64 大图直接写进 `extensionSettings` 或 `chatMetadata`（会导致 JSON 膨胀并卡死服务端存盘）。
统一走 ST 的后端稳定端点 `/api/images/upload`：
```typescript
const res = await fetch('/api/images/upload', {
  method: 'POST',
  headers: getContext().getRequestHeaders(), // 自带鉴权与 CSRF Token
  body: JSON.stringify({
    image: pureBase64,
    format: 'webp',
    ch_name: 'my_ext_assets',
    filename: `img_${Date.now()}`,
  }),
});
const { path } = await res.json(); // 返回服务端相对路径（如 /user/images/my_ext_assets/img_xxx.webp）
```

---

## 六、SillyTavern 交互管线与生命周期

### 1. 生命周期绑定模版
```typescript
function bindLifecycle() {
  const ctx = getContext();
  if (!ctx?.eventSource || !ctx?.eventTypes) return;

  const { eventSource: es, eventTypes: et } = ctx;

  // 1. 切换聊天
  es.on(et.CHAT_CHANGED, () => {
    // 重新加载当前对话元数据
  });

  // 2. 用户发送消息
  es.on(et.USER_MESSAGE_RENDERED, () => {
    // 处理用户输入
  });

  // 3. AI 回复生成落定
  es.on(et.CHARACTER_MESSAGE_RENDERED, () => {
    // 更新派生状态
  });

  // 4. 消息翻页/切换 Swipe
  es.on(et.MESSAGE_SWIPED, () => {
    // 刷新与当前 Swipe 绑定的数据
  });

  // 5. 消息删除
  es.on(et.MESSAGE_DELETED, () => {
    // 清理孤立状态
  });
}
```

### 2. 生成拦截器 (`generate_interceptor`)
在 `manifest.json` 中配置：
```json
{
  "generate_interceptor": "myext_generateInterceptor"
}
```
在代码中向 `globalThis` 暴露函数。在每次 ST 触发生成前被调用：
```typescript
(globalThis as any).myext_generateInterceptor = async (
  chat: unknown,
  contextSize: number,
  abort: (immediately: boolean) => void,
  type: string | undefined, // 'normal' | 'regenerate' | 'swipe' | 'quiet' 等
): Promise<void> => {
  // 返回前执行前置检查或异步预处理
  if (needBlock) {
    abort(true); // 拦截本次生成
    return;
  }
};
```

### 3. 上下文提示词注入 (`setExtensionPrompt`)
比直接修改 `eventData.chat` 更稳定且具有持久性。设置后每次生成都会按深度带上：
```typescript
const IN_CHAT = 1;
const ROLE_SYSTEM = 0;

// key 保证全局唯一；同 key 再次调用即覆盖更新；value 传空串即清除
ctx.setExtensionPrompt(
  'myext_prompt_key',
  promptText,
  IN_CHAT,
  depth, // 深度：0 最贴近最新消息，9999 靠近聊天历史顶部
  false, // scan
  ROLE_SYSTEM,
  null,
);
```

### 4. 动态能力注册（Slash Command 与 Macros）
无需打包额外文件，直接运行时动态 `import()` 宿主脚本：
- **Slash 命令**：
  ```typescript
  const { SlashCommandParser } = await import('/scripts/slash-commands/SlashCommandParser.js');
  const { SlashCommand } = await import('/scripts/slash-commands/SlashCommand.js');
  SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'my-cmd',
    callback: (args, unnamed) => { /* ... */ return 'output'; },
    helpString: '<div>说明</div>',
  }));
  ```
- **宏（Macro）**：
  ```typescript
  // 兼容新版实验性宏与旧版传统宏
  const legacyModule = await import('/scripts/macros.js');
  legacyModule.MacrosParser.registerMacro('myMacro', () => 'value', '宏说明');
  ```

---

## 七、通用 UI 交互模版与规范

1. **入口按钮注入规范**：
   - **魔杖菜单**（`#extensionsMenu`）：轮询等待元素就绪，追加原生 `.extension_container`，点击后主动收起菜单。
   - **顶栏抽屉**（`#top-settings-holder`）：使用原生 `.drawer`，点击只打开插件窗口，不触发原生抽屉折叠。
   - **快速回复栏**（`#qr--bar > .qr--buttons`）：使用 `MutationObserver` 监控 `#send_form`，防止宿主重绘输入栏时冲掉按钮。
   - **悬浮球**（`FloatingOrb`）：在 Shadow DOM 内渲染，带吸附边缘、拖拽位移与防误触点击判定。
2. **移动端自适应规范**：
   - `window.matchMedia('(max-width: 640px)')` 响应式桥接。
   - 下滑手势抽屉（基于 PointerEvent Capture，当位移大于阈值时平滑关闭）。
   - 遮罩防误触（比对 `pointerdown` 与 `click` 目标必须都是遮罩自身，并加打开 350ms 防穿透时间锁）。

---

## 八、避坑检查清单（Checklist）

1. [ ] **禁止 `Teleport to="body"`**：所有弹窗使用内部 `modalHost`。
2. [ ] **禁止在 `extensionSettings` 里塞 base64**：走 `/api/images/upload`。
3. [ ] **必须有 Hydration Gate**：在从 `extensionSettings` 读出配置前禁止 watch 回写。
4. [ ] **必须拦截方向键冒泡**：通过 `guardEditableArrowKeys` 保护 Shadow DOM 内的输入框。
5. [ ] **修改正文必须同步 Swipe**：如果修改消息的 `mes`，必须同时同步更新 `message.swipes[message.swipe_id]`，否则保存分裂。
6. [ ] **多根节点过渡警告**：`<Transition mode="out-in">` 容器下的页面组件必须有且仅有单一根 HTML 元素。
7. [ ] **外部脚本动态引入**：使用 `await import(/* @vite-ignore */ '/scripts/xxx.js')`，变量持有路径防止 Vite/vue-tsc 误将其当本地文件解析。
8. [ ] **退出清理**：`$(window).on('pagehide', () => app.unmount())`，并及时清除 `setInterval` 与 `MutationObserver`。
