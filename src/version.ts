export const PLUGIN_VERSION = typeof __PLUGIN_VERSION__ === 'string' ? __PLUGIN_VERSION__ : '1.0.0';

/**
 * 将相对产物路径解析为带版本号的绝对 URL，避免浏览器缓存
 */
export function versionedAssetUrl(relativePath: string, baseModuleUrl = import.meta.url): string {
  const url = new URL(relativePath, baseModuleUrl);
  url.searchParams.set('ver', PLUGIN_VERSION);
  return url.href;
}
