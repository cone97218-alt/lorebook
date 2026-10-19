<script setup lang="ts">
import { ref } from 'vue';
import {
  ui,
  type ThemeName,
  type PanelPosition,
  type PanelHeight,
  type FontSize,
  type AutoSaveMode,
} from '@/state/ui';
import { DEFAULT_SYMBOLS, type CustomSymbol } from '@/api/settings';
import { toast } from '@/st/toast';

// 折叠条展开状态管理（默认全部收起，界面清爽整洁）
const openSections = ref({
  layout: false,
  theme: false,
  sync: false,
  detail: false,
  editor: false,
  entrances: false,
  tutorial: false,
});

function toggleSection(sec: keyof typeof openSections.value) {
  openSections.value[sec] = !openSections.value[sec];
}

// 主题列表 (莫兰迪高级色系与酒馆自适应)
const themes: { id: ThemeName; name: string; bg: string; accent: string }[] = [
  { id: 'obsidian', name: '静谧雾灰', bg: '#15181c', accent: '#6b8ca8' },
  { id: 'midnight', name: '青苔橄榄', bg: '#141815', accent: '#6e9681' },
  { id: 'sepia', name: '烟熏陶土', bg: '#1a1715', accent: '#b88a76' },
  { id: 'slate', name: '丁香暮紫', bg: '#17151a', accent: '#95819e' },
  { id: 'pearl', name: '燕麦暖白', bg: '#f3f1ee', accent: '#5c7365' },
  { id: 'cloud_milk', name: '冰雾奶灰', bg: '#f4f6f8', accent: '#557999' },
  { id: 'matcha_sand', name: '抹茶杏仁', bg: '#f1f4f0', accent: '#4d7a5b' },
  { id: 'sunset_blush', name: '暮云暖粉', bg: '#f6f2f0', accent: '#9c6356' },
  { id: 'pale_marine', name: '海盐天青', bg: '#f0f4f5', accent: '#477782' },
  { id: 'st', name: '酒馆自适应', bg: '#1e2028', accent: '#3b82f6' },
];

// 位置列表
const positions: { id: PanelPosition; icon: string; label: string }[] = [
  { id: 'center', icon: 'fa-solid fa-arrows-to-dot', label: '居中弹窗' },
  { id: 'bottom', icon: 'fa-solid fa-arrow-up-from-bracket', label: '底部抽屉' },
  { id: 'top', icon: 'fa-solid fa-arrow-down', label: '顶部滑出' },
  { id: 'fullscreen', icon: 'fa-solid fa-expand', label: '全屏模式' },
];

// 高度选项
const heights: { id: PanelHeight; label: string }[] = [
  { id: 'compact', label: '50%' },
  { id: 'medium', label: '70%' },
  { id: 'large', label: '90%' },
  { id: 'full', label: '100%' },
];

// 字号选项
const fontSizes: { id: FontSize; label: string }[] = [
  { id: 'sm', label: '13px' },
  { id: 'md', label: '15px' },
  { id: 'lg', label: '17px' },
  { id: 'xl', label: '19px' },
];

// 自动存盘模式
const saveModes: { id: AutoSaveMode; label: string; desc: string }[] = [
  { id: 'exit', label: '离页存盘 (推荐)', desc: '仅在离开词条详情页或关闭面板时保存，编辑期间零卡顿' },
  { id: 'blur', label: '离焦存盘', desc: '收起键盘或离开输入框时保存' },
  { id: 'idle', label: '停笔存盘', desc: '停止打字经过防抖延迟后自动保存' },
  { id: 'manual', label: '手动存盘', desc: '仅在退出详情页或快捷键时触发保存' },
];

// 自定义符号输入
const newSymbolLabel = ref('');
const newSymbolText = ref('');

function addCustomSymbol() {
  const label = newSymbolLabel.value.trim();
  const text = newSymbolText.value;
  if (!label) {
    toast('请输入按钮显示文字', 'warning');
    return;
  }
  const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
  ui.customSymbols.push({
    id,
    label,
    insertText: text || label,
  });
  newSymbolLabel.value = '';
  newSymbolText.value = '';
  toast('已添加符号', 'success');
}

function removeCustomSymbol(id: string) {
  const idx = ui.customSymbols.findIndex(s => s.id === id);
  if (idx !== -1) {
    ui.customSymbols.splice(idx, 1);
  }
}

function resetSymbolsToDefault() {
  ui.customSymbols = JSON.parse(JSON.stringify(DEFAULT_SYMBOLS));
  toast('已恢复默认符号栏', 'info');
}

// 图标速查指南列表
const iconGuides = [
  {
    category: '导航与页面',
    items: [
      { icon: 'fa-solid fa-book-bookmark', name: '世界书条目列表', desc: '主页面导航，浏览、筛选与管理所有条目' },
      { icon: 'fa-solid fa-gear', name: '设置中心', desc: '配置外观主题、排版、召出方式及自动保存' },
      { icon: 'fa-solid fa-xmark', name: '关闭面板', desc: '退出编辑器浮窗' },
      { icon: 'fa-solid fa-chevron-left', name: '返回上一级', desc: '退出条目详情，返回条目列表' },
    ],
  },
  {
    category: '条目状态与策略',
    items: [
      { icon: 'fa-solid fa-power-off', name: '启停总开关', desc: '独立控制当前词条的全局启用与停用状态' },
      { icon: 'fa-solid fa-circle', name: '策略灯 (绿/蓝/紫)', desc: '点击切换激活策略：绿灯(按词触发) -> 蓝灯(常驻注入) -> 紫灯(向量/链接)' },
      { icon: 'fa-solid fa-magnifying-glass', name: '正文搜索与替换', desc: '快速定位与高亮检索正文关键词，支持单个或全部批量替换' },
      { icon: 'fa-solid fa-plus', name: '新建条目', desc: '快速创建并打开一个空世界书条目' },
      { icon: 'fa-solid fa-floppy-disk', name: '立即存盘', desc: '存在未保存修改时高亮变色，点击立即同步至酒馆' },
      { icon: 'fa-solid fa-circle-notch fa-spin', name: '同步中', desc: '后台正在向 SillyTavern 提交数据' },
      { icon: 'fa-solid fa-clone', name: '复制条目', desc: '快速克隆当前条目的副本' },
      { icon: 'fa-solid fa-trash-can', name: '删除条目', desc: '永久移除当前词条' },
    ],
  },
  {
    category: '关键词触发体系',
    items: [
      { icon: 'fa-solid fa-key', name: '主要触发词 (Primary)', desc: '上下文命中任意一个主要词即激活条目' },
      { icon: 'fa-solid fa-tags', name: '展开次要词栏', desc: '切换展开/收起次要关键词过滤配置' },
      { icon: 'fa-solid fa-tag', name: '次要过滤词 (Secondary)', desc: '必须在主关键词触发前提下辅助过滤' },
    ],
  },
  {
    category: '高级参数与控制',
    items: [
      { icon: 'fa-solid fa-shield-halved', name: '阻止递归 (Prevent Recursion)', desc: '激活后内容不会再去递归触发其他世界书词条' },
      { icon: 'fa-solid fa-ban', name: '排除递归 (Exclude Recursion)', desc: '其他词条内容不能触发本词条，仅由聊天消息触发' },
      { icon: 'fa-solid fa-font', name: '区分大小写 (Case Sensitive)', desc: '关键词大小写严格敏感匹配' },
      { icon: 'fa-solid fa-quote-right', name: '全词匹配 (Match Whole Words)', desc: '关键词需独立成词，防止词根误触' },
      { icon: 'fa-solid fa-location-dot', name: '插入位置 (Position)', desc: '角色前/角色后/作者注释/深度插入等' },
      { icon: 'fa-solid fa-layer-group', name: '插入深度 (Depth)', desc: '在深度模式下设定距离上下文底端的楼层数 (@D)' },
      { icon: 'fa-solid fa-arrows-up-down', name: '插入顺序 (Order)', desc: '排序数值越大越靠后插入 (#100)' },
      { icon: 'fa-solid fa-scale-balanced', name: '触发概率 (Probability)', desc: '满足条件时的激活百分比 (1-100%)' },
      { icon: 'fa-solid fa-file-lines', name: '字符总数', desc: '当前条目正文实时中英字符计数' },
      { icon: 'fa-solid fa-bolt', name: '估算 Token', desc: '基于中英分词权重的非阻塞异步 Token 测算' },
    ],
  },
];
</script>

<template>
  <div class="settings-page">
    <!-- 折叠组 1：面板呈现与位置 -->
    <div class="accordion-card">
      <header class="accordion-head" @click="toggleSection('layout')">
        <div class="head-title">
          <i class="fa-solid fa-window-restore group-icon"></i>
          <span>面板呈现与位置</span>
        </div>
        <i :class="openSections.layout ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'" class="chevron-icon"></i>
      </header>

      <div v-show="openSections.layout" class="accordion-content">
        <!-- 面板位置选择 -->
        <div class="sub-row">
          <span class="sub-label">弹出方向</span>
          <div class="pill-group">
            <button
              v-for="p in positions"
              :key="p.id"
              class="pill-btn"
              :class="{ active: ui.panelPosition === p.id }"
              @click="ui.panelPosition = p.id"
              :title="p.label"
            >
              <i :class="p.icon"></i>
              <span class="pill-text">{{ p.label }}</span>
            </button>
          </div>
        </div>

        <!-- 高度选择 (全屏模式除外) -->
        <div v-if="ui.panelPosition !== 'fullscreen'" class="sub-row">
          <span class="sub-label">面板高度</span>
          <div class="pill-group">
            <button
              v-for="h in heights"
              :key="h.id"
              class="pill-btn"
              :class="{ active: ui.panelHeight === h.id }"
              @click="ui.panelHeight = h.id"
            >
              <span class="pill-text">{{ h.label }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 折叠组 2：精致配色方案 -->
    <div class="accordion-card">
      <header class="accordion-head" @click="toggleSection('theme')">
        <div class="head-title">
          <i class="fa-solid fa-palette group-icon"></i>
          <span>配色方案</span>
        </div>
        <i :class="openSections.theme ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'" class="chevron-icon"></i>
      </header>

      <div v-show="openSections.theme" class="accordion-content">
        <div class="theme-grid">
          <div
            v-for="t in themes"
            :key="t.id"
            class="theme-card"
            :class="{ active: ui.theme === t.id }"
            @click="ui.theme = t.id"
          >
            <div class="theme-preview" :style="{ background: t.bg }">
              <span class="preview-dot" :style="{ background: t.accent }"></span>
            </div>
            <div class="theme-info">
              <span class="theme-name">{{ t.name }}</span>
              <i v-if="ui.theme === t.id" class="fa-solid fa-circle-check check-icon"></i>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 折叠组 3：自动存盘与同步 (解决打字频繁保存卡顿) -->
    <div class="accordion-card">
      <header class="accordion-head" @click="toggleSection('sync')">
        <div class="head-title">
          <i class="fa-solid fa-cloud-arrow-up group-icon"></i>
          <span>存盘机制与防卡顿</span>
        </div>
        <i :class="openSections.sync ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'" class="chevron-icon"></i>
      </header>

      <div v-show="openSections.sync" class="accordion-content">
        <div class="switch-row">
          <div class="switch-info">
            <span class="switch-title">自动存盘</span>
            <span class="switch-desc">无需每次手动点击保存按钮</span>
          </div>
          <input v-model="ui.autoSave" type="checkbox" class="toggle-checkbox" />
        </div>

        <div v-if="ui.autoSave" class="sub-row">
          <span class="sub-label">触发策略</span>
          <div class="mode-cards">
            <div
              v-for="m in saveModes"
              :key="m.id"
              class="mode-card"
              :class="{ active: ui.autoSaveMode === m.id }"
              @click="ui.autoSaveMode = m.id"
            >
              <div class="mode-head">
                <span class="mode-name">{{ m.label }}</span>
                <i v-if="ui.autoSaveMode === m.id" class="fa-solid fa-circle-check check-icon"></i>
              </div>
              <span class="mode-desc">{{ m.desc }}</span>
            </div>
          </div>
        </div>

        <div v-if="ui.autoSave && ui.autoSaveMode === 'idle'" class="sub-row">
          <span class="sub-label">停笔等待时间</span>
          <div class="pill-group">
            <button
              class="pill-btn"
              :class="{ active: ui.autoSaveDelay === 1500 }"
              @click="ui.autoSaveDelay = 1500"
            >
              <span class="pill-text">1.5 秒</span>
            </button>
            <button
              class="pill-btn"
              :class="{ active: ui.autoSaveDelay === 3000 }"
              @click="ui.autoSaveDelay = 3000"
            >
              <span class="pill-text">3.0 秒 (推荐)</span>
            </button>
            <button
              class="pill-btn"
              :class="{ active: ui.autoSaveDelay === 5000 }"
              @click="ui.autoSaveDelay = 5000"
            >
              <span class="pill-text">5.0 秒</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 折叠组 4：世界书详情页模块定制 -->
    <div class="accordion-card">
      <header class="accordion-head" @click="toggleSection('detail')">
        <div class="head-title">
          <i class="fa-solid fa-table-cells-large group-icon"></i>
          <span>详情页模块定制</span>
        </div>
        <i :class="openSections.detail ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'" class="chevron-icon"></i>
      </header>

      <div v-show="openSections.detail" class="accordion-content">
        <!-- 默认展开辅助栏 -->
        <div class="switch-row">
          <div class="switch-info">
            <span class="switch-title">默认展开辅助栏</span>
            <span class="switch-desc">进入词条时是否默认展开触发词与快捷符号栏（关闭可给正文最大输入视野）</span>
          </div>
          <input v-model="ui.editorDefaultExpandAccessories" type="checkbox" class="toggle-checkbox" />
        </div>

        <!-- 顶栏激活策略灯 -->
        <div class="switch-row">
          <div class="switch-info">
            <span class="switch-title">顶栏激活策略灯 (绿灯/蓝灯/紫灯)</span>
            <span class="switch-desc">顶部标题栏右侧显示策略指示灯，点击可循环切换激活模式</span>
          </div>
          <input v-model="ui.editorShowStatusLight" type="checkbox" class="toggle-checkbox" />
        </div>

        <!-- 启用链接 (紫灯/向量化) -->
        <div class="switch-row">
          <div class="switch-info">
            <span class="switch-title">显示与启用链接 (紫灯/向量化)</span>
            <span class="switch-desc">关闭后策略切换仅在绿灯与蓝灯间切换，条目筛选自动隐藏紫灯</span>
          </div>
          <input v-model="ui.showVectorized" type="checkbox" class="toggle-checkbox" />
        </div>

        <!-- 底栏统计信息 -->
        <div class="switch-row">
          <div class="switch-info">
            <span class="switch-title">底栏字数与 Token 统计</span>
            <span class="switch-desc">底部实时显示字符计数、估算 Token 与条目 UID</span>
          </div>
          <input v-model="ui.editorShowStats" type="checkbox" class="toggle-checkbox" />
        </div>

        <!-- 底栏高级策略抽屉总入口 -->
        <div class="switch-row">
          <div class="switch-info">
            <span class="switch-title">底栏高级策略抽屉总入口</span>
            <span class="switch-desc">底部右侧显示高级参数配置抽屉入口按钮</span>
          </div>
          <input v-model="ui.editorShowAdvancedDrawer" type="checkbox" class="toggle-checkbox" />
        </div>

        <!-- 细化高级参数抽屉项 -->
        <div v-if="ui.editorShowAdvancedDrawer" class="sub-settings-block">
          <span class="sub-group-title">高级抽屉参数项细分显示 (参考酒馆原生字段)：</span>

          <!-- 插入位置与深度 -->
          <div class="switch-row sub-switch-row">
            <div class="switch-info">
              <span class="switch-title">插入位置与深度</span>
              <span class="switch-desc">角色前/后、作者注释、深度插入 (@D) 等策略</span>
            </div>
            <input v-model="ui.editorShowPosition" type="checkbox" class="toggle-checkbox" />
          </div>

          <!-- 插入顺序 -->
          <div class="switch-row sub-switch-row">
            <div class="switch-info">
              <span class="switch-title">插入顺序 (Order)</span>
              <span class="switch-desc">注入上下文的排序优先级数值</span>
            </div>
            <input v-model="ui.editorShowOrder" type="checkbox" class="toggle-checkbox" />
          </div>

          <!-- 触发概率 -->
          <div class="switch-row sub-switch-row">
            <div class="switch-info">
              <span class="switch-title">触发概率 (Probability %)</span>
              <span class="switch-desc">命中后生效的百分比概率 (1-100)</span>
            </div>
            <input v-model="ui.editorShowProbability" type="checkbox" class="toggle-checkbox" />
          </div>

          <!-- 次要词过滤逻辑 -->
          <div class="switch-row sub-switch-row">
            <div class="switch-info">
              <span class="switch-title">次要词过滤逻辑</span>
              <span class="switch-desc">包含任意 / 包含全部 / 排除任意 / 排除全部</span>
            </div>
            <input v-model="ui.editorShowSelectiveLogic" type="checkbox" class="toggle-checkbox" />
          </div>

          <!-- 扫描深度 -->
          <div class="switch-row sub-switch-row">
            <div class="switch-info">
              <span class="switch-title">扫描深度 (Scan Depth)</span>
              <span class="switch-desc">独立限制本条目向后扫描聊天历史的楼层深度</span>
            </div>
            <input v-model="ui.editorShowScanDepth" type="checkbox" class="toggle-checkbox" />
          </div>

          <!-- 递归与匹配策略 -->
          <div class="switch-row sub-switch-row">
            <div class="switch-info">
              <span class="switch-title">递归与匹配高级策略</span>
              <span class="switch-desc">阻止递归、排除递归、区分大小写、全词匹配</span>
            </div>
            <input v-model="ui.editorShowRecursion" type="checkbox" class="toggle-checkbox" />
          </div>

          <!-- 自动化 ID -->
          <div class="switch-row sub-switch-row">
            <div class="switch-info">
              <span class="switch-title">自动化与扩展参数</span>
              <span class="switch-desc">自动化 ID (Automation ID) 等高级选项</span>
            </div>
            <input v-model="ui.editorShowAutomation" type="checkbox" class="toggle-checkbox" />
          </div>
        </div>
      </div>
    </div>

    <!-- 折叠组 5：写作排版与移动端符号辅助栏 -->
    <div class="accordion-card">
      <header class="accordion-head" @click="toggleSection('editor')">
        <div class="head-title">
          <i class="fa-solid fa-pen-nib group-icon"></i>
          <span>写作排版与符号栏</span>
        </div>
        <i :class="openSections.editor ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'" class="chevron-icon"></i>
      </header>

      <div v-show="openSections.editor" class="accordion-content">
        <!-- 字号 -->
        <div class="sub-row">
          <span class="sub-label">正文字号</span>
          <div class="pill-group">
            <button
              v-for="fs in fontSizes"
              :key="fs.id"
              class="pill-btn"
              :class="{ active: ui.fontSize === fs.id }"
              @click="ui.fontSize = fs.id"
            >
              <span class="pill-text">{{ fs.label }}</span>
            </button>
          </div>
        </div>

        <!-- 字体风格 -->
        <div class="sub-row">
          <span class="sub-label">字体风格</span>
          <div class="pill-group">
            <button
              class="pill-btn"
              :class="{ active: ui.fontFamily === 'sans' }"
              @click="ui.fontFamily = 'sans'"
            >
              <span class="pill-text">无衬线 (Sans)</span>
            </button>
            <button
              class="pill-btn"
              :class="{ active: ui.fontFamily === 'mono' }"
              @click="ui.fontFamily = 'mono'"
            >
              <span class="pill-text">等宽 (Mono)</span>
            </button>
          </div>
        </div>

        <!-- 符号辅助栏主开关 -->
        <div class="switch-row">
          <div class="switch-info">
            <span class="switch-title">移动端符号辅助栏</span>
            <span class="switch-desc">键盘上方高频排版标点快捷按钮</span>
          </div>
          <input v-model="ui.showSymbolBar" type="checkbox" class="toggle-checkbox" />
        </div>

        <!-- 自定义符号管理 -->
        <div v-if="ui.showSymbolBar" class="sub-row symbol-manager-box">
          <div class="symbol-manager-head">
            <span class="sub-label">自定义符号按钮</span>
            <button class="text-action-btn" @click="resetSymbolsToDefault">
              <i class="fa-solid fa-arrow-rotate-left"></i> 恢复默认
            </button>
          </div>

          <!-- 已有符号列表 -->
          <div class="symbol-chip-grid">
            <div
              v-for="sym in ui.customSymbols"
              :key="sym.id"
              class="symbol-manage-chip"
            >
              <span class="sym-chip-label">{{ sym.label }}</span>
              <span v-if="sym.insertText !== sym.label" class="sym-chip-text">{{ sym.insertText }}</span>
              <button class="sym-chip-del" @click="removeCustomSymbol(sym.id)">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>

          <!-- 添加符号表单 -->
          <div class="add-symbol-form">
            <input
              v-model="newSymbolLabel"
              type="text"
              placeholder="显示 (//)"
              class="sym-input label-in"
              maxlength="10"
            />
            <input
              v-model="newSymbolText"
              type="text"
              placeholder="插入内容 (留空同显示)"
              class="sym-input text-in"
            />
            <button class="add-sym-btn" @click="addCustomSymbol">
              <i class="fa-solid fa-plus"></i>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 折叠组 5：召出方式与入口 -->
    <div class="accordion-card">
      <header class="accordion-head" @click="toggleSection('entrances')">
        <div class="head-title">
          <i class="fa-solid fa-door-open group-icon"></i>
          <span>召出方式与入口</span>
        </div>
        <i :class="openSections.entrances ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'" class="chevron-icon"></i>
      </header>

      <div v-show="openSections.entrances" class="accordion-content">
        <div class="switch-row">
          <div class="switch-info">
            <span class="switch-title">替换顶部原生世界书图标</span>
            <span class="switch-desc">点击酒馆顶部原有世界书图标时，直接打开本扩展</span>
          </div>
          <input v-model="ui.replaceNativeWorldBook" type="checkbox" class="toggle-checkbox" />
        </div>

        <div class="switch-row">
          <div class="switch-info">
            <span class="switch-title">原生世界书抽屉按钮</span>
            <span class="switch-desc">在酒馆原生世界书面板注入快捷启动图标</span>
          </div>
          <input v-model="ui.showWorldDrawerBtn" type="checkbox" class="toggle-checkbox" />
        </div>

        <div class="switch-row">
          <div class="switch-info">
            <span class="switch-title">顶栏图标按钮</span>
            <span class="switch-desc">在 ST 顶部快捷操作栏注入图标</span>
          </div>
          <input v-model="ui.showTopBar" type="checkbox" class="toggle-checkbox" />
        </div>

        <div class="switch-row">
          <div class="switch-info">
            <span class="switch-title">聊天输入栏快捷图标</span>
            <span class="switch-desc">在主输入框快速回复条旁显示</span>
          </div>
          <input v-model="ui.showQuickReply" type="checkbox" class="toggle-checkbox" />
        </div>

        <div class="switch-row">
          <div class="switch-info">
            <span class="switch-title">贴边悬浮球</span>
            <span class="switch-desc">在屏幕边缘显示可拖拽的快捷悬浮小球</span>
          </div>
          <input v-model="ui.showOrb" type="checkbox" class="toggle-checkbox" />
        </div>
      </div>
    </div>

    <!-- 折叠组 6：图标功能速查指南 (教程) -->
    <div class="accordion-card">
      <header class="accordion-head" @click="toggleSection('tutorial')">
        <div class="head-title">
          <i class="fa-solid fa-circle-question group-icon"></i>
          <span>图标功能速查指南</span>
        </div>
        <i :class="openSections.tutorial ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'" class="chevron-icon"></i>
      </header>

      <div v-show="openSections.tutorial" class="accordion-content">
        <p class="tutorial-tip">
          本插件采用全纯图标极简设计。如遇不熟悉的图标，可在此速查功能含义：
        </p>

        <div v-for="cat in iconGuides" :key="cat.category" class="guide-category">
          <h4 class="guide-cat-title">{{ cat.category }}</h4>
          <div class="guide-table">
            <div v-for="item in cat.items" :key="item.name" class="guide-row">
              <div class="guide-icon-cell">
                <i :class="item.icon"></i>
              </div>
              <div class="guide-text-cell">
                <span class="guide-item-name">{{ item.name }}</span>
                <span class="guide-item-desc">{{ item.desc }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  display: block;
  flex: 1 1 0;
  min-height: 0;
  height: 100%;
  max-height: 100%;
  overflow-y: auto !important;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  overscroll-behavior-y: contain;
  box-sizing: border-box;
  padding: 14px 16px 80px;
}

.settings-page::-webkit-scrollbar {
  width: 6px;
}

.settings-page::-webkit-scrollbar-thumb {
  background: var(--myext-line-strong);
  border-radius: 3px;
}

.settings-page::-webkit-scrollbar-track {
  background: transparent;
}

/* 折叠卡片 */
.accordion-card {
  display: block;
  width: 100%;
  flex-shrink: 0 !important;
  margin-bottom: 12px;
  background: var(--myext-surface);
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius);
  overflow: hidden;
  transition: border-color 0.15s;
  box-sizing: border-box;
}

.accordion-card:last-child {
  margin-bottom: 0;
}

.accordion-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  cursor: pointer;
  user-select: none;
  background: var(--myext-surface);
  transition: background 0.15s;
}

.accordion-head:active {
  background: var(--myext-surface-2);
}

.head-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--myext-ink);
}

.group-icon {
  font-size: 14px;
  color: var(--myext-accent);
}

.chevron-icon {
  font-size: 12px;
  color: var(--myext-ink-muted);
}

.accordion-content {
  padding: 12px 16px 16px;
  border-top: 1px solid var(--myext-line);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 子行设置 */
.sub-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sub-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--myext-ink-soft);
}

/* 胶囊按钮组 */
.pill-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pill-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--myext-surface-2);
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius-sm);
  color: var(--myext-ink-soft);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.pill-btn:active {
  transform: scale(0.97);
}

.pill-btn.active {
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  border-color: var(--myext-accent);
  font-weight: 600;
}

.pill-btn i {
  font-size: 13px;
}

/* 主题网格 */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 10px;
}

.theme-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius-sm);
  overflow: hidden;
  cursor: pointer;
  background: var(--myext-surface-2);
  transition: all 0.15s;
}

.theme-card.active {
  border-color: var(--myext-accent);
  box-shadow: 0 0 0 1px var(--myext-accent);
}

.theme-preview {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.preview-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
}

.theme-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
}

.theme-name {
  font-size: 12px;
  color: var(--myext-ink);
  font-weight: 500;
}

.check-icon {
  font-size: 12px;
  color: var(--myext-accent);
}

/* 开关行 */
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.switch-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.switch-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--myext-ink);
}

.switch-desc {
  font-size: 11px;
  color: var(--myext-ink-muted);
}

.toggle-checkbox {
  width: 20px;
  height: 20px;
  accent-color: var(--myext-accent);
  cursor: pointer;
  flex-shrink: 0;
}

.sub-settings-block {
  margin-top: 6px;
  padding: 10px 12px;
  background: var(--myext-surface-2);
  border-radius: var(--myext-radius-sm);
  border: 1px solid var(--myext-line);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sub-group-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--myext-ink-soft);
  margin-bottom: 2px;
}

.sub-switch-row {
  padding-bottom: 6px;
  border-bottom: 1px dashed var(--myext-line);
}

.sub-switch-row:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

/* 存盘模式选择卡片 */
.mode-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mode-card {
  padding: 10px 12px;
  background: var(--myext-surface-2);
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius-sm);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: all 0.15s;
}

.mode-card.active {
  border-color: var(--myext-accent);
  background: color-mix(in srgb, var(--myext-surface-2) 90%, var(--myext-accent) 10%);
}

.mode-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mode-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--myext-ink);
}

.mode-desc {
  font-size: 11px;
  color: var(--myext-ink-soft);
  line-height: 1.4;
}

/* 符号栏管理器 */
.symbol-manager-box {
  background: var(--myext-surface-2);
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius-sm);
  padding: 12px;
}

.symbol-manager-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.text-action-btn {
  background: transparent;
  border: none;
  font-size: 11px;
  color: var(--myext-accent);
  cursor: pointer;
  padding: 2px 6px;
}

.symbol-chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.symbol-manage-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--myext-surface);
  border: 1px solid var(--myext-line);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
}

.sym-chip-label {
  font-weight: 600;
  color: var(--myext-ink);
}

.sym-chip-text {
  font-size: 10px;
  color: var(--myext-ink-muted);
  background: var(--myext-surface-2);
  padding: 1px 4px;
  border-radius: 4px;
  font-family: var(--myext-font-mono);
}

.sym-chip-del {
  background: transparent;
  border: none;
  color: var(--myext-ink-muted);
  cursor: pointer;
  padding: 0 2px;
  font-size: 11px;
}

.sym-chip-del:hover {
  color: #ef4444;
}

.add-symbol-form {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  width: 100%;
  box-sizing: border-box;
}

.sym-input {
  background: var(--myext-surface);
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius-sm);
  padding: 6px 10px;
  font-size: 12px;
  color: var(--myext-ink);
  outline: none;
  box-sizing: border-box;
}

.sym-input:focus {
  border-color: var(--myext-accent);
}

.label-in {
  width: 80px;
  flex: 0 0 80px;
  min-width: 0;
}

.text-in {
  flex: 1 1 0%;
  min-width: 0;
}

.add-sym-btn {
  background: var(--myext-accent);
  color: var(--myext-accent-ink);
  border: none;
  border-radius: var(--myext-radius-sm);
  width: 34px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

/* 教程速查表 */
.tutorial-tip {
  font-size: 12px;
  color: var(--myext-ink-soft);
  margin: 0;
  line-height: 1.5;
}

.guide-category {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.guide-cat-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--myext-accent);
  margin: 4px 0 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.guide-table {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.guide-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  background: var(--myext-surface-2);
  border: 1px solid var(--myext-line);
  border-radius: var(--myext-radius-sm);
}

.guide-icon-cell {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--myext-surface);
  border-radius: 6px;
  color: var(--myext-accent);
  font-size: 14px;
  flex-shrink: 0;
}

.guide-text-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.guide-item-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--myext-ink);
}

.guide-item-desc {
  font-size: 11px;
  color: var(--myext-ink-soft);
  line-height: 1.35;
}
</style>
