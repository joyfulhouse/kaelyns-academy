// scripts/gen-icons.ts
// Render the Twinkle app icons from a single star design. Run once after an icon
// design change: `bun run gen:icons`. Outputs are committed; sharp is a
// devDependency and is NEVER imported by app/runtime code.
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const PAPER = "#fdf6e9";
const HONEY = "#f2c14e";
const INK = "#3b352c";
const CORAL = "#e8896b";

const STAR =
  "M60 12 L73.2 41.6 L104.6 45.3 L81.4 66.7 L87.6 97.6 L60 82.2 " +
  "L32.4 97.6 L38.6 66.7 L15.4 45.3 L46.8 41.6 Z";

/** Twinkle on an optional opaque background, scaled into `size`px. `pad` shrinks the
 *  star toward center (maskable safe zone). `bg=null` → transparent. */
function twinkleSvg(size: number, bg: string | null, pad: number): string {
  const inner = 120 * (1 - pad * 2);
  const off = (120 - inner) / 2;
  const rect = bg ? `<rect width="120" height="120" fill="${bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 120 120">
  ${rect}
  <g transform="translate(${off} ${off}) scale(${inner / 120})">
    <path d="${STAR}" fill="${HONEY}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="49" cy="58" r="4" fill="${INK}"/>
    <circle cx="71" cy="58" r="4" fill="${INK}"/>
    <path d="M51 70 q9 9 18 0" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
    <circle cx="43" cy="68" r="5" fill="${CORAL}" opacity="0.55"/>
    <circle cx="77" cy="68" r="5" fill="${CORAL}" opacity="0.55"/>
  </g>
</svg>`;
}

async function png(svg: string, out: string): Promise<void> {
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log("wrote", out);
}

async function main(): Promise<void> {
  await mkdir("public/icons", { recursive: true });
  await png(twinkleSvg(192, null, 0.06), "public/icons/icon-192.png");
  await png(twinkleSvg(512, null, 0.06), "public/icons/icon-512.png");
  await png(twinkleSvg(512, PAPER, 0.22), "public/icons/maskable-512.png"); // safe zone
  await png(twinkleSvg(180, PAPER, 0.12), "src/app/apple-icon.png"); // opaque for iOS
}

void main();
