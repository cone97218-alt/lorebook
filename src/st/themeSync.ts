export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function clampAlpha(a: number): number {
  return Math.max(0, Math.min(1, a));
}

function parseColorDirect(input: string): RgbaColor | null {
  const s = input.trim().toLowerCase();
  if (!s || s === 'transparent') {
    return s === 'transparent' ? { r: 0, g: 0, b: 0, a: 0 } : null;
  }

  // Hex: #rgb, #rgba, #rrggbb, #rrggbbaa
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1;
      if ([r, g, b, a].some(Number.isNaN)) return null;
      return { r, g, b, a };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      if ([r, g, b, a].some(Number.isNaN)) return null;
      return { r, g, b, a };
    }
    return null;
  }

  // rgb(...) / rgba(...)
  const rgbMatch = s.match(/^rgba?\(([^)]+)\)$/);
  if (rgbMatch) {
    const inner = rgbMatch[1].trim();
    let parts: string[];
    let alphaPart: string | undefined;

    if (inner.includes(',')) {
      parts = inner.split(',').map(p => p.trim());
      alphaPart = parts[3];
    } else {
      const slashParts = inner.split('/').map(p => p.trim());
      parts = slashParts[0].split(/\s+/).filter(Boolean);
      alphaPart = slashParts[1];
    }

    if (parts.length < 3) return null;
    const parseChannel = (token: string): number => {
      if (token.endsWith('%')) {
        return (parseFloat(token) / 100) * 255;
      }
      return parseFloat(token);
    };
    const r = clampByte(parseChannel(parts[0]));
    const g = clampByte(parseChannel(parts[1]));
    const b = clampByte(parseChannel(parts[2]));
    let a = 1;
    if (alphaPart !== undefined) {
      a = alphaPart.endsWith('%') ? parseFloat(alphaPart) / 100 : parseFloat(alphaPart);
    }
    if ([r, g, b, a].some(Number.isNaN)) return null;
    return { r, g, b, a: clampAlpha(a) };
  }

  // color(srgb r g b / a)
  const srgbMatch = s.match(/^color\(\s*srgb\s+([^)]+)\)$/);
  if (srgbMatch) {
    const slashParts = srgbMatch[1].trim().split('/').map(p => p.trim());
    const channels = slashParts[0].split(/\s+/).filter(Boolean);
    if (channels.length < 3) return null;
    const r = clampByte(parseFloat(channels[0]) * 255);
    const g = clampByte(parseFloat(channels[1]) * 255);
    const b = clampByte(parseFloat(channels[2]) * 255);
    const a = slashParts[1] !== undefined ? clampAlpha(parseFloat(slashParts[1])) : 1;
    if ([r, g, b, a].some(Number.isNaN)) return null;
    return { r, g, b, a };
  }

  return null;
}

function resolveCssVarColor(varName: string): RgbaColor | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  const rootStyle = getComputedStyle(document.documentElement);
  const bodyStyle = document.body ? getComputedStyle(document.body) : null;
  const raw = (bodyStyle?.getPropertyValue(varName) || rootStyle.getPropertyValue(varName) || '').trim();
  if (!raw) return null;

  const direct = parseColorDirect(raw);
  if (direct) return direct;

  // 对于包含 var(...)、hsl(...)、oklch(...) 等复杂表达式，用临时探测节点让浏览器计算最终 RGBA
  const host = document.body || document.documentElement;
  const probe = document.createElement('span');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;width:0;height:0;';
  probe.style.color = `var(${varName})`;
  host.appendChild(probe);
  try {
    const computed = getComputedStyle(probe).color;
    return parseColorDirect(computed);
  } finally {
    probe.remove();
  }
}

function relativeLuminance(c: { r: number; g: number; b: number }): number {
  const toLinear = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
}

function contrastRatio(c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }): number {
  const l1 = relativeLuminance(c1);
  const l2 = relativeLuminance(c2);
  const bright = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}

function mixColor(
  base: { r: number; g: number; b: number },
  overlay: { r: number; g: number; b: number },
  weight: number,
): RgbaColor {
  const w = Math.max(0, Math.min(1, weight));
  return {
    r: clampByte(base.r * (1 - w) + overlay.r * w),
    g: clampByte(base.g * (1 - w) + overlay.g * w),
    b: clampByte(base.b * (1 - w) + overlay.b * w),
    a: 1,
  };
}

function colorDistance(c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }): number {
  return Math.abs(c1.r - c2.r) + Math.abs(c1.g - c2.g) + Math.abs(c1.b - c2.b);
}

function toRgb(c: { r: number; g: number; b: number }): string {
  return `rgb(${clampByte(c.r)}, ${clampByte(c.g)}, ${clampByte(c.b)})`;
}

function toRgba(c: { r: number; g: number; b: number }, alpha: number): string {
  return `rgba(${clampByte(c.r)}, ${clampByte(c.g)}, ${clampByte(c.b)}, ${clampAlpha(alpha).toFixed(2)})`;
}

/**
 * 解析 SillyTavern 宿主主题 CSS 变量，生成 100% 实心、防透明穿模且层次分明的插件色板
 */
export function resolveStThemeVars(): Record<string, string> {
  const bodyColor = resolveCssVarColor('--SmartThemeBodyColor');
  const ink: RgbaColor = bodyColor && bodyColor.a > 0.1
    ? { r: bodyColor.r, g: bodyColor.g, b: bodyColor.b, a: 1 }
    : { r: 20, g: 33, b: 61, a: 1 };

  // 根据文字相对亮度判断酒馆当前为深色系还是浅色系
  const isDarkTheme = relativeLuminance(ink) > 0.22;
  const fallbackBg: RgbaColor = isDarkTheme
    ? { r: 23, g: 26, b: 32, a: 1 }
    : { r: 243, g: 244, b: 246, a: 1 };

  // 1. 解析主背景色 (--SmartThemeBlurTintColor)，强制去透明并校验与文字对比度
  const blurTint = resolveCssVarColor('--SmartThemeBlurTintColor');
  let bg = fallbackBg;
  if (blurTint) {
    const isZeroTransparent = blurTint.a <= 0.05 && blurTint.r === 0 && blurTint.g === 0 && blurTint.b === 0;
    const solidBlur: RgbaColor = { r: blurTint.r, g: blurTint.g, b: blurTint.b, a: 1 };
    if (!isZeroTransparent && contrastRatio(solidBlur, ink) >= 3.0) {
      bg = solidBlur;
    }
  }

  // 2. 解析卡片/表面色 (--SmartThemeChatTintColor) 三级保底策略
  const chatTint = resolveCssVarColor('--SmartThemeChatTintColor');
  let surface: RgbaColor;
  let surface2: RgbaColor;

  if (chatTint && chatTint.a >= 0.2 && contrastRatio(chatTint, ink) >= 3.0) {
    // 聊天背景本身不透明度正常：剥离透明通道，与主背景实心混合保持原本质感
    const solidChat: RgbaColor = { r: chatTint.r, g: chatTint.g, b: chatTint.b, a: 1 };
    surface = chatTint.a >= 0.85
      ? solidChat
      : mixColor(bg, solidChat, Math.min(0.92, Math.max(0.65, chatTint.a + 0.25)));
    surface2 = mixColor(surface, ink, 0.08);
  } else if (
    chatTint &&
    !(chatTint.r === 0 && chatTint.g === 0 && chatTint.b === 0) &&
    !(chatTint.r === 255 && chatTint.g === 255 && chatTint.b === 255) &&
    contrastRatio(chatTint, ink) >= 3.0
  ) {
    // 聊天背景透明度被拉到 0 (或 < 0.2)，但带有非纯黑/非纯白的有效色相：提取 RGB 色相与实心主背景融合
    const solidChat: RgbaColor = { r: chatTint.r, g: chatTint.g, b: chatTint.b, a: 1 };
    surface = mixColor(bg, solidChat, 0.55);
    if (colorDistance(surface, bg) < 12) {
      surface = mixColor(bg, ink, 0.06);
    }
    surface2 = mixColor(surface, ink, 0.08);
  } else {
    // 聊天背景为全透明 (如 rgba(0,0,0,0)) 或与文字撞色：基于实心主背景与文字色派生柔和层级面
    surface = mixColor(bg, ink, 0.06);
    surface2 = mixColor(bg, ink, 0.13);
  }

  // 若表面色与背景色完全重合（例如纯黑+纯黑），轻微拉开 5% 层次避免卡片边界消失
  if (colorDistance(surface, bg) < 8) {
    surface = mixColor(bg, ink, 0.05);
    surface2 = mixColor(bg, ink, 0.11);
  }

  // 3. 强调色与高对比度按钮文字
  const quoteColor = resolveCssVarColor('--SmartThemeQuoteColor');
  const highlightColor = resolveCssVarColor('--SmartThemeHighlightColor');
  const rawAccent =
    (quoteColor && quoteColor.a > 0.15 ? quoteColor : null) ||
    (highlightColor && highlightColor.a > 0.15 ? highlightColor : null) ||
    { r: 113, g: 140, b: 193, a: 1 };
  const accent: RgbaColor = { r: rawAccent.r, g: rawAccent.g, b: rawAccent.b, a: 1 };
  const accentInk = relativeLuminance(accent) > 0.42 ? '#14181d' : '#ffffff';

  // 4. 边框保底（防止无边框主题丢失分割线）
  const borderColor = resolveCssVarColor('--SmartThemeBorderColor');
  const line =
    borderColor && borderColor.a >= 0.12
      ? toRgba(borderColor, Math.max(0.18, borderColor.a))
      : toRgba(ink, isDarkTheme ? 0.14 : 0.12);
  const lineStrong =
    borderColor && borderColor.a >= 0.15
      ? toRgb(mixColor(borderColor, ink, 0.3))
      : toRgba(ink, isDarkTheme ? 0.25 : 0.22);

  // 5. 阴影保底
  const shadowColor = resolveCssVarColor('--SmartThemeShadowColor');
  const shadowRgba =
    shadowColor && shadowColor.a >= 0.1
      ? toRgba(shadowColor, Math.min(0.45, Math.max(0.22, shadowColor.a)))
      : 'rgba(0, 0, 0, 0.28)';

  return {
    '--myext-st-bg': toRgb(bg),
    '--myext-st-surface': toRgb(surface),
    '--myext-st-surface-2': toRgb(surface2),
    '--myext-st-ink': toRgb(ink),
    '--myext-st-ink-soft': toRgb(mixColor(bg, ink, 0.72)),
    '--myext-st-ink-muted': toRgb(mixColor(bg, ink, 0.5)),
    '--myext-st-accent': toRgb(accent),
    '--myext-st-accent-soft': toRgba(accent, 0.14),
    '--myext-st-accent-ink': accentInk,
    '--myext-st-line': line,
    '--myext-st-line-strong': lineStrong,
    '--myext-st-shadow': `0 18px 48px -20px ${shadowRgba}, 0 4px 12px -6px ${shadowRgba}`,
  };
}
