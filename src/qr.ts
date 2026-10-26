import qrcode from 'qrcode-generator';

export interface QrMatrix {
  size: number;
  /** One SVG path drawing every dark module, in module units. */
  path: string;
  isDark: (row: number, col: number) => boolean;
}

const cache = new Map<string, QrMatrix>();

/** A QR code for a URL. Medium error correction: the code stays readable
 *  from a phone held at an angle across a glossy screen, and Wikipedia URLs
 *  are short enough that it stays a coarse grid. */
export function qrFor(text: string): QrMatrix {
  const hit = cache.get(text);
  if (hit) return hit;
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  let path = '';
  for (let r = 0; r < size; r += 1) {
    // One rectangle per horizontal run, not per module: a fraction of the
    // path length, and no hairline seams between neighbors.
    for (let c = 0; c < size; c += 1) {
      if (!qr.isDark(r, c)) continue;
      let end = c;
      while (end + 1 < size && qr.isDark(r, end + 1)) end += 1;
      path += `M${c} ${r}h${end - c + 1}v1h-${end - c + 1}z`;
      c = end;
    }
  }
  const matrix = { size, path, isDark: (r: number, c: number) => qr.isDark(r, c) };
  if (cache.size > 64) cache.clear();
  cache.set(text, matrix);
  return matrix;
}
