/**
 * Deterministic 1400×1400 SVG cover from title hash — no external services.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export function hashPalette(title: string): { bg: string; fg: string; accent: string } {
  const h = crypto.createHash('sha256').update(title || 'untitled').digest();
  const hue = h[0] * 1.4;
  const bg = `hsl(${hue % 360}, 42%, 18%)`;
  const accent = `hsl(${(hue + 40) % 360}, 55%, 48%)`;
  const fg = '#f8fafc';
  return { bg, fg, accent };
}

export function generateCoverSvg(
  title: string,
  author?: string,
  size = 1400,
): string {
  const { bg, fg, accent } = hashPalette(title);
  const safeTitle = escapeXml((title || 'Untitled').slice(0, 80));
  const safeAuthor = escapeXml((author || 'Resonara').slice(0, 60));
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="100%" stop-color="${accent}"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect x="80" y="80" width="${size - 160}" height="${size - 160}" fill="none" stroke="${fg}" stroke-opacity="0.25" stroke-width="4" rx="24"/>
  <text x="50%" y="42%" text-anchor="middle" fill="${fg}" font-family="Georgia, serif" font-size="64" font-weight="700">${safeTitle}</text>
  <text x="50%" y="55%" text-anchor="middle" fill="${fg}" fill-opacity="0.85" font-family="system-ui,sans-serif" font-size="36">${safeAuthor}</text>
  <text x="50%" y="88%" text-anchor="middle" fill="${fg}" fill-opacity="0.5" font-family="system-ui,sans-serif" font-size="28">Resonara</text>
</svg>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Write SVG cover next to job; returns path. PNG conversion optional via ffmpeg. */
export async function writeCoverFiles(
  outDir: string,
  title: string,
  author?: string,
): Promise<{ svgPath: string; pngPath?: string }> {
  fs.mkdirSync(outDir, { recursive: true });
  const svgPath = path.join(outDir, 'cover.svg');
  fs.writeFileSync(svgPath, generateCoverSvg(title, author), 'utf8');
  return { svgPath };
}

export function buildAtempoChain(speed: number): number[] {
  // ffmpeg atempo must be in [0.5, 2.0]; chain for outside range
  if (!Number.isFinite(speed) || speed <= 0) throw new Error('invalid speed');
  const factors: number[] = [];
  let remaining = speed;
  // handle slow
  while (remaining < 0.5 - 1e-9) {
    factors.push(0.5);
    remaining /= 0.5;
  }
  while (remaining > 2.0 + 1e-9) {
    // peel off largest allowed
    if (remaining / 2.0 >= 0.5) {
      factors.push(2.0);
      remaining /= 2.0;
    } else {
      break;
    }
  }
  // final factor in range
  if (Math.abs(remaining - 1) > 1e-6) {
    // split awkward remainders like 2.5 → 1.25 * 2
    if (remaining > 2) {
      factors.push(2.0);
      remaining /= 2.0;
    }
    if (remaining < 0.5) {
      factors.push(0.5);
      remaining /= 0.5;
    }
    factors.push(Number(remaining.toFixed(4)));
  }
  if (!factors.length) factors.push(1.0);
  // verify product ~ speed
  const prod = factors.reduce((a, b) => a * b, 1);
  if (Math.abs(prod - speed) > 0.05 * speed && Math.abs(prod - speed) > 0.05) {
    // rebuild simple for common cases
    return buildAtempoChainSimple(speed);
  }
  return factors;
}

function buildAtempoChainSimple(speed: number): number[] {
  // Explicit targets from phase requirements
  if (Math.abs(speed - 0.5) < 1e-6) return [0.5];
  if (Math.abs(speed - 3.0) < 1e-6) return [1.5, 2.0];
  if (Math.abs(speed - 2.5) < 1e-6) return [1.25, 2.0];
  if (speed >= 0.5 && speed <= 2.0) return [Number(speed.toFixed(4))];
  const factors: number[] = [];
  let r = speed;
  while (r > 2.0) {
    factors.push(2.0);
    r /= 2.0;
  }
  while (r < 0.5) {
    factors.push(0.5);
    r /= 0.5;
  }
  factors.push(Number(r.toFixed(4)));
  return factors;
}

export function atempoFilterGraph(speed: number): string {
  return buildAtempoChain(speed)
    .map((f) => `atempo=${f}`)
    .join(',');
}
