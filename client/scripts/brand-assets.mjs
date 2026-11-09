// Regenerates every logo-derived file from the vector master:
//   public/brand/almagles-mark.svg  →  favicon.svg, icons/*.png, og-default.png
//
// Run from client/:  node scripts/brand-assets.mjs
// Uses sharp (installed at the repo root for the server). The share image's Arabic text is
// rendered with the machine's system fonts, so check og-default.png after regenerating.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const PUBLIC = new URL('../public/', import.meta.url);
const out = (p) => new URL(p, PUBLIC);

// The logo's own paper and inks (see --brand-* in src/index.css).
const PAPER = '#dfdbd0';
const INK = '#18252e';
const MAROON = '#461415';
const GOLD = '#80511b';
const NIGHT = { ink: '#e9e4d8', olive: '#a3a688', maroon: '#b5504a', gold: '#d8a14a' };

const master = await readFile(out('brand/almagles-mark.svg'), 'utf8');
const [, vw, vh] = master.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).map(Number);
const inner = master.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();

/** The mark scaled to fit a box of `size`, centred at (cx, cy). */
function placed(cx, cy, size, body = inner) {
  const s = size / Math.max(vw, vh);
  return `<g transform="translate(${cx - (vw * s) / 2} ${cy - (vh * s) / 2}) scale(${s})">${body}</g>`;
}

const svg = (w, h, content) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${content}</svg>`;

async function png(file, w, h, content) {
  await sharp(Buffer.from(svg(w, h, content)), { density: 144 }).resize(w, h).png({ compressionLevel: 9 }).toFile(fileURLToPath(out(file)));
  console.log('✓', file);
}

// Browser tab: transparent, inks swap for dark browser chrome.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}">
<style>@media (prefers-color-scheme: dark){path[fill="#18252e"]{fill:${NIGHT.ink}}path[fill="#4c4f3e"]{fill:${NIGHT.olive}}path[fill="#461415"]{fill:${NIGHT.maroon}}path[fill="#80511b"]{fill:${NIGHT.gold}}}</style>
${inner}
</svg>
`;
await writeFile(out('favicon.svg'), favicon);
console.log('✓ favicon.svg');
await png('icons/favicon-32.png', 32, 32, placed(16, 16, 31));

// Install icons: the mark on its own paper. "any" icons get a rounded tile;
// apple-touch and maskable are full-bleed because the OS applies its own mask.
const tile = (n, r) => `<rect width="${n}" height="${n}" rx="${r}" fill="${PAPER}"/>`;
await png('icons/icon-192.png', 192, 192, tile(192, 42) + placed(96, 98, 140));
await png('icons/icon-512.png', 512, 512, tile(512, 112) + placed(256, 261, 372));
await png('icons/apple-touch-icon.png', 180, 180, tile(180, 0) + placed(90, 92, 132));
// Maskable safe zone is the central 80% circle, so keep the mark inside ~60%.
await png('icons/maskable-512.png', 512, 512, tile(512, 0) + placed(256, 260, 300));

// Android status-bar badge: only the alpha channel is used, so a white silhouette.
const silhouette = inner.replace(/fill="#[0-9a-f]{6}"/gi, 'fill="#fff"');
await png('icons/badge-96.png', 96, 96, placed(48, 48, 84, silhouette));

// Link previews (WhatsApp, Telegram, X…): 1200×630.
// Same arch lattice as ArchPattern in src/components/Logo.tsx.
const ARCH = 'v-14c0-7 5-10.5 9-13c3-2 5-5 5-9c0 4 2 7 5 9c4 2.5 9 6 9 13v14z';
const W = 1200;
const H = 630;
const og = `
<defs>
  <pattern id="p" width="72" height="96" patternUnits="userSpaceOnUse">
    <g fill="none" stroke="${GOLD}" stroke-opacity=".16" stroke-width="1" stroke-linejoin="round">
      ${[[22, 44], [-14, 92], [58, 92]]
        .map(([x, y]) => `<path d="M${x} ${y}${ARCH}"/><rect x="${x + 11.5}" y="${y - 13}" width="5" height="5" transform="rotate(45 ${x + 14} ${y - 10.5})"/>`)
        .join('')}
    </g>
  </pattern>
  <radialGradient id="v" cx="50%" cy="42%" r="65%">
    <stop offset="0" stop-color="${PAPER}" stop-opacity="1"/>
    <stop offset=".55" stop-color="${PAPER}" stop-opacity=".9"/>
    <stop offset="1" stop-color="${PAPER}" stop-opacity="0"/>
  </radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="${PAPER}"/>
<rect width="${W}" height="${H}" fill="url(#p)"/>
<rect width="${W}" height="${H}" fill="url(#v)"/>
<rect x="36" y="36" width="${W - 72}" height="${H - 72}" rx="18" fill="none" stroke="${GOLD}" stroke-opacity=".45" stroke-width="1.5"/>
${placed(W / 2, 168, 236)}
<text x="${W / 2}" y="392" text-anchor="middle" direction="rtl" font-family="Segoe UI, Noto Naskh Arabic, Arial" font-weight="700" font-size="92" fill="${INK}">رجال الأمة</text>
<rect x="${W / 2 - 40}" y="448" width="80" height="3" rx="1.5" fill="${GOLD}"/>
<text x="${W / 2}" y="516" text-anchor="middle" direction="rtl" font-family="Segoe UI, Noto Naskh Arabic, Arial" font-size="38" fill="${MAROON}">المقرر الأسبوعي والمنشورات اليومية</text>
`;
await png('og-default.png', W, H, og);
