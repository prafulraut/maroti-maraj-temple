/**
 * Prepares a photo in the browser before upload.
 *
 * The API runs on Netlify Functions (max ~4 MB per image) and images are
 * stored in MongoDB, so phone photos (5–10 MB) are resized to at most
 * `maxSide` px and re-encoded as JPEG.
 *
 * Any format the browser can decode (HEIC on Safari, BMP, TIFF, AVIF, JFIF, …)
 * is converted to JPEG so it displays on every device. GIFs are returned
 * unchanged (to keep animation). If the browser can't decode the file at all,
 * the original is sent as-is when it is small enough.
 */
const WEB_SAFE = ['image/jpeg', 'image/png', 'image/webp'];

export async function compressImage(
  file: File,
  maxSide = 1920,
  maxBytes = 3.5 * 1024 * 1024,
): Promise<File> {
  if (file.type === 'image/gif') return file;

  let bitmap: HTMLImageElement;
  try {
    bitmap = await loadImage(file);
  } catch {
    // Browser can't read this format (e.g. HEIC on Chrome) → send original if it fits
    if (file.size <= maxBytes) return file;
    throw new Error(`${file.name} could not be read by this browser and is too large to upload unchanged.`);
  }

  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));

  // Already small enough and in a web-friendly format → upload original
  if (scale === 1 && file.size <= maxBytes && WEB_SAFE.includes(file.type)) return file;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';                  // transparent PNG → white background
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  let quality = 0.85;
  let blob = await toBlob(canvas, quality);
  while (blob.size > maxBytes && quality > 0.4) {
    quality -= 0.1;
    blob = await toBlob(canvas, quality);
  }

  const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], base + '.jpg', { type: 'image/jpeg' });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Could not read ${file.name}`)); };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Image compression failed'))), 'image/jpeg', quality),
  );
}
