import { getContext } from '@/st/context';
import { reactive, watch } from 'vue';

export type ThemeName =
  | 'obsidian'
  | 'midnight'
  | 'sepia'
  | 'slate'
  | 'pearl'
  | 'cloud_milk'
  | 'matcha_sand'
  | 'sunset_blush'
  | 'pale_marine'
  | 'st';
export type PanelPosition = 'center' | 'bottom' | 'top' | 'fullscreen';
export type PanelHeight = 'compact' | 'medium' | 'large' | 'full';
export type FontSize = 'sm' | 'md' | 'lg' | 'xl';
export type FontFamily = 'sans' | 'mono';
export type AutoSaveMode = 'idle' | 'blur' | 'manual';

export interface CustomSymbol {
  id: string;
  label: string;
  insertText: string;
}

export const DEFAULT_SYMBOLS: CustomSymbol[] = [
  { id: '1', label: 'Tab', insertText: '  ' },
  { id: '2', label: '#', insertText: '# ' },
  { id: '3', label: '*', insertText: '* ' },
  { id: '4', label: '-', insertText: '- ' },
  { id: '5', label: '::', insertText: ':: ' },
  { id: '6', label: '{}', insertText: '{}' },
  { id: '7', label: '「」', insertText: '「」' },
  { id: '8', label: '“”', insertText: '“”' },
  { id: '9', label: '【】', insertText: '【】' },
  { id: '10', label: '<>', insertText: '<>' },
];

export interface ExtensionSettings {
  enabled: boolean;
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
  showVectorized: boolean;
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
}

const SETTINGS_KEY = 'st_fluent_lorebook_settings';

export function defaultSettings(): ExtensionSettings {
  return {
    enabled: true,
    theme: 'pearl',
    panelPosition: 'center',
    panelHeight: 'large',
    fontSize: 'md',
    fontFamily: 'sans',
    showSymbolBar: true,
    customSymbols: JSON.parse(JSON.stringify(DEFAULT_SYMBOLS)),
    autoSave: true,
    autoSaveMode: 'idle',
    autoSaveDelay: 3000,
    showTopBar: false,
    showQuickReply: false,
    showOrb: false,
    showWorldDrawerBtn: true,
    showVectorized: false,
    editorDefaultExpandAccessories: false,
    editorShowStatusLight: true,
    editorShowStats: true,
    editorShowAdvancedDrawer: true,
    editorShowPosition: true,
    editorShowOrder: true,
    editorShowProbability: true,
    editorShowSelectiveLogic: true,
    editorShowScanDepth: false,
    editorShowRecursion: true,
    editorShowAutomation: false,
  };
}

function normalize(raw: unknown): ExtensionSettings {
  if (!raw || typeof raw !== 'object') return defaultSettings();
  const d = defaultSettings();
  const obj = raw as Partial<ExtensionSettings>;

  const validThemes: ThemeName[] = [
    'obsidian',
    'midnight',
    'sepia',
    'slate',
    'pearl',
    'cloud_milk',
    'matcha_sand',
    'sunset_blush',
    'pale_marine',
    'st',
  ];
  const validPositions: PanelPosition[] = ['center', 'bottom', 'top', 'fullscreen'];
  const validHeights: PanelHeight[] = ['compact', 'medium', 'large', 'full'];
  const validFontSizes: FontSize[] = ['sm', 'md', 'lg', 'xl'];
  const validFontFamilies: FontFamily[] = ['sans', 'mono'];
  const validSaveModes: AutoSaveMode[] = ['idle', 'blur', 'manual'];

  const customSymbols = Array.isArray(obj.customSymbols) && obj.customSymbols.length > 0
    ? obj.customSymbols.map((s, i) => ({
        id: String(s?.id || i),
        label: String(s?.label || ''),
        insertText: String(s?.insertText || ''),
      })).filter(s => s.label)
    : JSON.parse(JSON.stringify(DEFAULT_SYMBOLS));

  return {
    enabled: typeof obj.enabled === 'boolean' ? obj.enabled : d.enabled,
    theme: validThemes.includes(obj.theme as ThemeName) ? (obj.theme as ThemeName) : d.theme,
    panelPosition: validPositions.includes(obj.panelPosition as PanelPosition) ? (obj.panelPosition as PanelPosition) : d.panelPosition,
    panelHeight: validHeights.includes(obj.panelHeight as PanelHeight) ? (obj.panelHeight as PanelHeight) : d.panelHeight,
    fontSize: validFontSizes.includes(obj.fontSize as FontSize) ? (obj.fontSize as FontSize) : d.fontSize,
    fontFamily: validFontFamilies.includes(obj.fontFamily as FontFamily) ? (obj.fontFamily as FontFamily) : d.fontFamily,
    showSymbolBar: typeof obj.showSymbolBar === 'boolean' ? obj.showSymbolBar : d.showSymbolBar,
    customSymbols,
    autoSave: typeof obj.autoSave === 'boolean' ? obj.autoSave : d.autoSave,
    autoSaveMode: validSaveModes.includes(obj.autoSaveMode as AutoSaveMode) ? (obj.autoSaveMode as AutoSaveMode) : d.autoSaveMode,
    autoSaveDelay: typeof obj.autoSaveDelay === 'number' ? obj.autoSaveDelay : d.autoSaveDelay,
    showTopBar: typeof obj.showTopBar === 'boolean' ? obj.showTopBar : d.showTopBar,
    showQuickReply: typeof obj.showQuickReply === 'boolean' ? obj.showQuickReply : d.showQuickReply,
    showOrb: typeof obj.showOrb === 'boolean' ? obj.showOrb : d.showOrb,
    showWorldDrawerBtn: typeof obj.showWorldDrawerBtn === 'boolean' ? obj.showWorldDrawerBtn : d.showWorldDrawerBtn,
    showVectorized: typeof obj.showVectorized === 'boolean' ? obj.showVectorized : d.showVectorized,
    editorDefaultExpandAccessories: typeof obj.editorDefaultExpandAccessories === 'boolean' ? obj.editorDefaultExpandAccessories : d.editorDefaultExpandAccessories,
    editorShowStatusLight: typeof obj.editorShowStatusLight === 'boolean' ? obj.editorShowStatusLight : d.editorShowStatusLight,
    editorShowStats: typeof obj.editorShowStats === 'boolean' ? obj.editorShowStats : d.editorShowStats,
    editorShowAdvancedDrawer: typeof obj.editorShowAdvancedDrawer === 'boolean' ? obj.editorShowAdvancedDrawer : d.editorShowAdvancedDrawer,
    editorShowPosition: typeof obj.editorShowPosition === 'boolean' ? obj.editorShowPosition : d.editorShowPosition,
    editorShowOrder: typeof obj.editorShowOrder === 'boolean' ? obj.editorShowOrder : d.editorShowOrder,
    editorShowProbability: typeof obj.editorShowProbability === 'boolean' ? obj.editorShowProbability : d.editorShowProbability,
    editorShowSelectiveLogic: typeof obj.editorShowSelectiveLogic === 'boolean' ? obj.editorShowSelectiveLogic : d.editorShowSelectiveLogic,
    editorShowScanDepth: typeof obj.editorShowScanDepth === 'boolean' ? obj.editorShowScanDepth : d.editorShowScanDepth,
    editorShowRecursion: typeof obj.editorShowRecursion === 'boolean' ? obj.editorShowRecursion : d.editorShowRecursion,
    editorShowAutomation: typeof obj.editorShowAutomation === 'boolean' ? obj.editorShowAutomation : d.editorShowAutomation,
  };
}

export const extensionSettings = reactive<ExtensionSettings>(defaultSettings());

// Hydration 状态守门标志
let isReady = false;
const readyCallbacks: Array<() => void> = [];

export function onSettingsReady(cb: () => void): void {
  if (isReady) cb();
  else readyCallbacks.push(cb);
}

/**
 * 从 SillyTavern 的 extensionSettings (服务端 settings.json) 中水合加载配置。
 */
export function hydrateSettings(): void {
  if (isReady) return;
  const ctx = getContext();
  if (!ctx?.extensionSettings) return;

  const stored = ctx.extensionSettings[SETTINGS_KEY];
  if (stored && typeof stored === 'object') {
    Object.assign(extensionSettings, normalize(stored));
  } else {
    // 首次初始化
    ctx.extensionSettings[SETTINGS_KEY] = JSON.parse(JSON.stringify(extensionSettings));
    ctx.saveSettingsDebounced?.();
  }

  isReady = true;
  for (const cb of readyCallbacks.splice(0)) {
    try {
      cb();
    } catch {
      /* ignore */
    }
  }
}

// 深度监听，自动防抖写回服务端
watch(
  extensionSettings,
  () => {
    if (!isReady) return;
    const ctx = getContext();
    if (!ctx?.extensionSettings) return;
    ctx.extensionSettings[SETTINGS_KEY] = JSON.parse(JSON.stringify(extensionSettings));
    ctx.saveSettingsDebounced?.();
  },
  { deep: true },
);
