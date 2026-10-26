import type { PhotoLayout, QrSize } from './config';

export type Arrangement = 'side' | 'top' | 'background' | 'none';

/** Below this short side a photo costs the headline more than it adds. */
const MIN_PHOTO_SIDE = 260;

/** Where a story's photo goes in a `w`×`h` panel. Automatic puts it beside
 *  the text in a wide box and above it in a tall one. */
export function arrange(photo: PhotoLayout, w: number, h: number, hasImage: boolean): Arrangement {
  if (!hasImage || photo === 'off') return 'none';
  if (photo === 'background') return 'background';
  if (Math.min(w, h) < MIN_PHOTO_SIDE) return 'none';
  if (photo === 'side' || photo === 'top') return photo;
  return w / h >= 1.15 ? 'side' : 'top';
}

/** The photo's share of the panel: about 4 tenths, but never wider than a
 *  16:9 frame of the panel's height (a strip would be all photo), nor taller
 *  than 2:3 of its width. */
export function photoSize(arrangement: Arrangement, w: number, h: number): { w: number; h: number } {
  if (arrangement === 'side') return { w: Math.round(Math.min(w * 0.44, h * 1.78)), h };
  if (arrangement === 'top') return { w, h: Math.round(Math.min(h * 0.44, w * 0.66)) };
  return { w, h };
}

const QR_FRACTION: Record<QrSize, number> = { small: 0.24, medium: 0.32, large: 0.42 };

/** The QR code's side in pixels: a share of the text area's short side,
 *  never so small a phone can't read it, never more than half its width. */
export function qrPixels(w: number, h: number, size: QrSize): number {
  const side = Math.min(w * 0.75, h) * QR_FRACTION[size];
  return Math.round(Math.max(64, Math.min(side, w * 0.45, h * 0.6)));
}
