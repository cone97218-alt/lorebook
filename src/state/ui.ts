import {
  extensionSettings,
  onSettingsReady,
  type ThemeName,
  type PanelPosition,
  type PanelHeight,
  type FontSize,
  type FontFamily,
  type AutoSaveMode,
  type CustomSymbol,
  DEFAULT_SYMBOLS,
} from '@/api/settings';
import { reactive, ref, watch } from 'vue';

export type {
  ThemeName,
  PanelPosition,
  PanelHeight,
  FontSize,
  FontFamily,
  AutoSaveMode,
  CustomSymbol,
};

export const modalHost = ref<HTMLElement | null>(null);

export interface UiState {
  open: boolean;
  activePage: string;
  theme: ThemeName;
  panelPosition: PanelPosition;
  panelHeight: PanelHeight;
  fontSize: FontSize;
  fontFamily: FontFamily;
  showSymbolBar: boolean;
  customSymbols: CustomSymbol[];
  autoSave: boolean;
  autoSaveMode: AutoSaveMode;
  autoSaveDelay: number;
  showTopBar: boolean;
  showQuickReply: boolean;
  showOrb: boolean;
  showWorldDrawerBtn: boolean;
  editorDefaultExpandAccessories: boolean;
  editorShowStatusLight: boolean;
  editorShowStats: boolean;
  editorShowAdvancedDrawer: boolean;
  editorShowPosition: boolean;
  editorShowOrder: boolean;
  editorShowProbability: boolean;
  editorShowSelectiveLogic: boolean;
  editorShowScanDepth: boolean;
  editorShowRecursion: boolean;
  editorShowAutomation: boolean;
  showVectorized: boolean;
  replaceNativeWorldBook: boolean;
}

const PAGE_STORAGE_KEY = 'st_fluent_lorebook.ui.page';

function loadActivePage(): string {
  try {
    return localStorage.getItem(PAGE_STORAGE_KEY) || 'lorebook';
  } catch {
    return 'lorebook';
  }
}

export const ui = reactive<UiState>({
  open: false,
  activePage: loadActivePage(),
  theme: extensionSettings.theme,
  panelPosition: extensionSettings.panelPosition,
  panelHeight: extensionSettings.panelHeight,
  fontSize: extensionSettings.fontSize,
  fontFamily: extensionSettings.fontFamily,
  showSymbolBar: extensionSettings.showSymbolBar,
  customSymbols: extensionSettings.customSymbols,
  autoSave: extensionSettings.autoSave,
  autoSaveMode: extensionSettings.autoSaveMode,
  autoSaveDelay: extensionSettings.autoSaveDelay,
  showTopBar: extensionSettings.showTopBar,
  showQuickReply: extensionSettings.showQuickReply,
  showOrb: extensionSettings.showOrb,
  showWorldDrawerBtn: extensionSettings.showWorldDrawerBtn,
  editorDefaultExpandAccessories: extensionSettings.editorDefaultExpandAccessories,
  editorShowStatusLight: extensionSettings.editorShowStatusLight,
  editorShowStats: extensionSettings.editorShowStats,
  editorShowAdvancedDrawer: extensionSettings.editorShowAdvancedDrawer,
  editorShowPosition: extensionSettings.editorShowPosition,
  editorShowOrder: extensionSettings.editorShowOrder,
  editorShowProbability: extensionSettings.editorShowProbability,
  editorShowSelectiveLogic: extensionSettings.editorShowSelectiveLogic,
  editorShowScanDepth: extensionSettings.editorShowScanDepth,
  editorShowRecursion: extensionSettings.editorShowRecursion,
  editorShowAutomation: extensionSettings.editorShowAutomation,
  showVectorized: extensionSettings.showVectorized,
  replaceNativeWorldBook: extensionSettings.replaceNativeWorldBook,
});

onSettingsReady(() => {
  ui.theme = extensionSettings.theme;
  ui.panelPosition = extensionSettings.panelPosition;
  ui.panelHeight = extensionSettings.panelHeight;
  ui.fontSize = extensionSettings.fontSize;
  ui.fontFamily = extensionSettings.fontFamily;
  ui.showSymbolBar = extensionSettings.showSymbolBar;
  ui.customSymbols = extensionSettings.customSymbols;
  ui.autoSave = extensionSettings.autoSave;
  ui.autoSaveMode = extensionSettings.autoSaveMode;
  ui.autoSaveDelay = extensionSettings.autoSaveDelay;
  ui.showTopBar = extensionSettings.showTopBar;
  ui.showQuickReply = extensionSettings.showQuickReply;
  ui.showOrb = extensionSettings.showOrb;
  ui.showWorldDrawerBtn = extensionSettings.showWorldDrawerBtn;
  ui.editorDefaultExpandAccessories = extensionSettings.editorDefaultExpandAccessories;
  ui.editorShowStatusLight = extensionSettings.editorShowStatusLight;
  ui.editorShowStats = extensionSettings.editorShowStats;
  ui.editorShowAdvancedDrawer = extensionSettings.editorShowAdvancedDrawer;
  ui.editorShowPosition = extensionSettings.editorShowPosition;
  ui.editorShowOrder = extensionSettings.editorShowOrder;
  ui.editorShowProbability = extensionSettings.editorShowProbability;
  ui.editorShowSelectiveLogic = extensionSettings.editorShowSelectiveLogic;
  ui.editorShowScanDepth = extensionSettings.editorShowScanDepth;
  ui.editorShowRecursion = extensionSettings.editorShowRecursion;
  ui.editorShowAutomation = extensionSettings.editorShowAutomation;
  ui.showVectorized = extensionSettings.showVectorized;
  ui.replaceNativeWorldBook = extensionSettings.replaceNativeWorldBook;
});

watch(
  () => [
    ui.theme,
    ui.panelPosition,
    ui.panelHeight,
    ui.fontSize,
    ui.fontFamily,
    ui.showSymbolBar,
    JSON.stringify(ui.customSymbols),
    ui.autoSave,
    ui.autoSaveMode,
    ui.autoSaveDelay,
    ui.showTopBar,
    ui.showQuickReply,
    ui.showOrb,
    ui.showWorldDrawerBtn,
    ui.editorDefaultExpandAccessories,
    ui.editorShowStatusLight,
    ui.editorShowStats,
    ui.editorShowAdvancedDrawer,
    ui.editorShowPosition,
    ui.editorShowOrder,
    ui.editorShowProbability,
    ui.editorShowSelectiveLogic,
    ui.editorShowScanDepth,
    ui.editorShowRecursion,
    ui.editorShowAutomation,
    ui.showVectorized,
    ui.replaceNativeWorldBook,
  ],
  () => {
    extensionSettings.theme = ui.theme;
    extensionSettings.panelPosition = ui.panelPosition;
    extensionSettings.panelHeight = ui.panelHeight;
    extensionSettings.fontSize = ui.fontSize;
    extensionSettings.fontFamily = ui.fontFamily;
    extensionSettings.showSymbolBar = ui.showSymbolBar;
    extensionSettings.customSymbols = ui.customSymbols;
    extensionSettings.autoSave = ui.autoSave;
    extensionSettings.autoSaveMode = ui.autoSaveMode;
    extensionSettings.autoSaveDelay = ui.autoSaveDelay;
    extensionSettings.showTopBar = ui.showTopBar;
    extensionSettings.showQuickReply = ui.showQuickReply;
    extensionSettings.showOrb = ui.showOrb;
    extensionSettings.showWorldDrawerBtn = ui.showWorldDrawerBtn;
    extensionSettings.editorDefaultExpandAccessories = ui.editorDefaultExpandAccessories;
    extensionSettings.editorShowStatusLight = ui.editorShowStatusLight;
    extensionSettings.editorShowStats = ui.editorShowStats;
    extensionSettings.editorShowAdvancedDrawer = ui.editorShowAdvancedDrawer;
    extensionSettings.editorShowPosition = ui.editorShowPosition;
    extensionSettings.editorShowOrder = ui.editorShowOrder;
    extensionSettings.editorShowProbability = ui.editorShowProbability;
    extensionSettings.editorShowSelectiveLogic = ui.editorShowSelectiveLogic;
    extensionSettings.editorShowScanDepth = ui.editorShowScanDepth;
    extensionSettings.editorShowRecursion = ui.editorShowRecursion;
    extensionSettings.editorShowAutomation = ui.editorShowAutomation;
    extensionSettings.showVectorized = ui.showVectorized;
    extensionSettings.replaceNativeWorldBook = ui.replaceNativeWorldBook;
  },
  { deep: true },
);

watch(
  () => ui.activePage,
  val => {
    try {
      localStorage.setItem(PAGE_STORAGE_KEY, val);
    } catch {
      /* ignore */
    }
  },
);

/** 打开时间戳，用于防穿透遮罩关闭 */
export let lastOpenedAt = 0;

export function openApp(page?: string): void {
  if (page) ui.activePage = page;
  ui.open = true;
  lastOpenedAt = performance.now();
}

export function closeApp(): void {
  ui.open = false;
}
