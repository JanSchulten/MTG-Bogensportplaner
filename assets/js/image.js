/**
 * Bilder vor dem Hochladen verkleinern — spart Speicher und Ladezeit,
 * und hält den Demo-Modus innerhalb des localStorage-Limits.
 */

const MAX_EDGE = 1600;
const QUALITY = 0.82;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** @returns {Promise<{blob: Blob, dataUrl: string, width: number, height: number}>} */
export async function shrinkImage(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Bitte eine Bilddatei auswählen.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Das Bild ist größer als 10 MB.');
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Betrifft vor allem HEIC-Aufnahmen älterer iPhones.
    throw new Error('Dieses Bildformat kann der Browser nicht öffnen. Bitte als JPG oder PNG speichern.');
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY)
  );
  if (!blob) throw new Error('Bild konnte nicht verarbeitet werden.');

  return { blob, dataUrl: canvas.toDataURL('image/jpeg', QUALITY), width, height };
}
