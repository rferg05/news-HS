import type { PhotoLayout, QrSize } from './config';

export type Arrangement = 'side' | 'top' | 'background' | 'none';

/** Below this short side a photo costs the headline more than it adds. */
const MIN_PHOTO_SIDE = 260;

/** The photo gets at most half the panel, so the headline keeps the rest,
 *  and at least a quarter, so it's worth showing. */
const MAX_SHARE = 0.5;
const MIN_SHARE = 0.25;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The photo's frame, shaped to the photo (`ratio` = its width / height):
 *  beside the text it takes the panel's full height and as much width as the
 *  photo needs at that height; above the text, the full width and the height
 *  the photo needs. Both within the shares above, so a frame only differs
 *  from the photo's shape when the photo is very wide or very tall. */
export function photoSize(arrangement: Arrangement, w: number, h: number, ratio: number): { w: number; h: number } {
  if (arrangement === 'side') return { w: Math.round(clamp(h * ratio, w * MIN_SHARE, w * MAX_SHARE)), h };
  if (arrangement === 'top') return { w, h: Math.round(clamp(w / ratio, h * MIN_SHARE, h * MAX_SHARE)) };
  return { w, h };
}

/** How much of a frame the whole photo covers when fitted inside it. */
function shownArea(frame: { w: number; h: number }, ratio: number): number {
  const pw = Math.min(frame.w, frame.h * ratio);
  return pw * (pw / ratio);
}

/** Where a story's photo goes in a `w`×`h` panel. Automatic picks whichever
 *  of beside or above the text shows this photo largest: a wide photo in a
 *  wide panel goes beside, the same photo in a tall panel goes above. */
export function arrange(photo: PhotoLayout, w: number, h: number, hasImage: boolean, ratio: number): Arrangement {
  if (!hasImage || photo === 'off') return 'none';
  if (photo === 'background') return 'background';
  if (Math.min(w, h) < MIN_PHOTO_SIDE) return 'none';
  if (photo === 'side' || photo === 'top') return photo;
  const side = shownArea(photoSize('side', w, h, ratio), ratio);
  const top = shownArea(photoSize('top', w, h, ratio), ratio);
  return side >= top ? 'side' : 'top';
}

const QR_FRACTION: Record<QrSize, number> = { small: 0.24, medium: 0.32, large: 0.42 };

/** The QR code's side in pixels: a share of the text area's short side,
 *  never so small a phone can't read it, never more than half its width. */
export function qrPixels(w: number, h: number, size: QrSize): number {
  const side = Math.min(w * 0.75, h) * QR_FRACTION[size];
  return Math.round(Math.max(64, Math.min(side, w * 0.45, h * 0.6)));
}
