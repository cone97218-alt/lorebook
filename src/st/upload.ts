import { getContext } from '@/st/context';

const MAX_SIDE = 256;
const QUALITY = 0.85;
const GIF_MAX_BYTES = 2 * 1024 * 1024;

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error ?? new Error('读取文件失败'));
    fr.readAsDataURL(file);
  });
}

function stripDataUrl(dataUrl: string): string {
  return dataUrl.split(',')[1] ?? '';
}

function isGif(file: File): boolean {
  return file.type === 'image/gif' || /\.gif$/i.test(file.name);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解码失败'));
    img.src = src;
  });
}

async function compressToBase64(file: File): Promise<string> {
  const dataUrl = await readAsDataURL(file);
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 不可用');
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL('image/webp', QUALITY);
  return stripDataUrl(out);
}

let seq = 0;

/**
 * 通用图片上传服务：将用户选择的本地文件上传至 SillyTavern 服务器，返回相对路径串。
 * 避免在 settings.json 中保存庞大的 Base64。
 */
export async function uploadAssetImage(file: File, subDir = 'extension_assets'): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');

  let base64: string;
  let format: string;
  if (isGif(file)) {
    if (file.size > GIF_MAX_BYTES) {
      throw new Error(`GIF 不能超过 ${Math.round(GIF_MAX_BYTES / 1024 / 1024)}MB`);
    }
    base64 = stripDataUrl(await readAsDataURL(file));
    format = 'gif';
  } else {
    base64 = await compressToBase64(file);
    format = 'webp';
  }

  const ctx = getContext();
  const headers = ctx?.getRequestHeaders?.();
  if (!headers) throw new Error('SillyTavern 未就绪，请稍后再试');

  const res = await fetch('/api/images/upload', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      image: base64,
      format,
      ch_name: subDir,
      filename: `asset_${Date.now()}_${++seq}`,
    }),
  });

  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.error ?? '';
    } catch {
      /* ignore */
    }
    throw new Error(detail || `上传失败 (${res.status})`);
  }

  const data = (await res.json()) as { path?: string };
  if (!data.path) throw new Error('服务器未返回路径');
  return data.path;
}
