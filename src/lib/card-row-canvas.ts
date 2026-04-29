import { fillManaCostCircle, parseScryfallMana } from "@/lib/mana-for-canvas";

/** Mana font glyph for card type (Mana CSS ::before content). */
const TYPE_GLYPH = (code: number) => String.fromCharCode(code);

/** Supertypes that precede the card type on the type line (CR 205.4 + Token). */
const SUPERTYPE_PREFIX =
  /^(Legendary|Basic|Snow|World|Ongoing|Time|Host|Torment|Elite|Token)\s+/i;

function primaryTypeSegment(typeLine: string): string {
  const em = typeLine.indexOf("\u2014");
  const en = typeLine.indexOf("\u2013");
  const cut = em >= 0 ? em : en >= 0 ? en : -1;
  return (cut >= 0 ? typeLine.slice(0, cut) : typeLine).trim();
}

function stripLeadingSupertypes(s: string): string {
  let t = s.trim();
  while (SUPERTYPE_PREFIX.test(t)) {
    t = t.replace(SUPERTYPE_PREFIX, "").trim();
  }
  return t;
}

/** Multi-word card types: pick one glyph (Mana font has no combined icons). */
const TYPE_COMBO: { re: RegExp; g: string }[] = [
  { re: /\bland\s+creature\b|\bcreature\s+land\b/i, g: TYPE_GLYPH(0xe622) },
  { re: /\bartifact\s+land\b|\bland\s+artifact\b/i, g: TYPE_GLYPH(0xe622) },
  { re: /\bartifact\s+creature\b|\bcreature\s+artifact\b/i, g: TYPE_GLYPH(0xe61f) },
  { re: /\benchantment\s+creature\b|\bcreature\s+enchantment\b/i, g: TYPE_GLYPH(0xe61f) },
];

const TYPE_LINE_PREFIX: { re: RegExp; g: string }[] = [
  { re: /^planeswalker\b/i, g: TYPE_GLYPH(0xe623) },
  { re: /^battle\b/i, g: TYPE_GLYPH(0xe9d1) },
  { re: /^creature\b/i, g: TYPE_GLYPH(0xe61f) },
  { re: /^instant\b/i, g: TYPE_GLYPH(0xe621) },
  { re: /^sorcery\b/i, g: TYPE_GLYPH(0xe624) },
  { re: /^enchantment\b/i, g: TYPE_GLYPH(0xe620) },
  { re: /^artifact\b/i, g: TYPE_GLYPH(0xe61e) },
  { re: /^land\b/i, g: TYPE_GLYPH(0xe622) },
  { re: /^dungeon\b/i, g: TYPE_GLYPH(0xe995) },
  { re: /^plane\b/i, g: TYPE_GLYPH(0xe96f) },
  { re: /^scheme\b/i, g: TYPE_GLYPH(0xe970) },
  { re: /^phenomenon\b/i, g: TYPE_GLYPH(0xe96e) },
  { re: /^conspiracy\b/i, g: TYPE_GLYPH(0xe972) },
  { re: /^vanguard\b/i, g: TYPE_GLYPH(0xe971) },
  { re: /^tribal\b/i, g: TYPE_GLYPH(0xe925) },
  /** Lorcana / modern rules word for spell types that used to be “Tribal …”. */
  { re: /^kindred\b/i, g: TYPE_GLYPH(0xe925) },
  /** Sorcery class (no dedicated Mana glyph); artifact reads reasonably in-strip. */
  { re: /^class\b/i, g: TYPE_GLYPH(0xe61e) },
];

/** First matching word wins (order tuned for “Artifact Creature”, etc.). */
const TYPE_FALLBACK: { word: string; g: string }[] = [
  { word: "planeswalker", g: TYPE_GLYPH(0xe623) },
  { word: "battle", g: TYPE_GLYPH(0xe9d1) },
  { word: "conspiracy", g: TYPE_GLYPH(0xe972) },
  { word: "vanguard", g: TYPE_GLYPH(0xe971) },
  { word: "creature", g: TYPE_GLYPH(0xe61f) },
  { word: "instant", g: TYPE_GLYPH(0xe621) },
  { word: "sorcery", g: TYPE_GLYPH(0xe624) },
  { word: "enchantment", g: TYPE_GLYPH(0xe620) },
  { word: "artifact", g: TYPE_GLYPH(0xe61e) },
  { word: "land", g: TYPE_GLYPH(0xe622) },
];

/**
 * Maps `type_line` (first segment, before em/en dash) to a Mana-font type icon.
 * Handles supertypes (e.g. “Legendary Land”), Tribal/Kindred, and common multi-type lines.
 */
export function typeLineToManaGlyph(typeLine: string | null): string | null {
  if (!typeLine) return null;
  let t = stripLeadingSupertypes(primaryTypeSegment(typeLine));
  for (let i = 0; i < 4; i++) {
    if (/^tribal\s+/i.test(t)) {
      t = t.replace(/^tribal\s+/i, "").trim();
      t = stripLeadingSupertypes(t);
      continue;
    }
    if (/^kindred\s+/i.test(t)) {
      t = t.replace(/^kindred\s+/i, "").trim();
      t = stripLeadingSupertypes(t);
      continue;
    }
    break;
  }
  for (const { re, g } of TYPE_COMBO) {
    if (re.test(t)) return g;
  }
  for (const { re, g } of TYPE_LINE_PREFIX) {
    if (re.test(t)) return g;
  }
  for (const { word, g } of TYPE_FALLBACK) {
    if (new RegExp(`\\b${word}\\b`, "i").test(t)) return g;
  }
  return null;
}

/** Paints the identity column to match the row (no full-height WUBRG block). */
export function fillIdentityColumnBg(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  rowBackground: string,
) {
  ctx.fillStyle = rowBackground;
  ctx.fillRect(x, y, width, height);
}

const TYPE_ICON_DIAM = 18;

/** Type icon: no pip background; glyph only (white on dark UI, dark on light). */
export function drawTypeGlyphInStrip(
  ctx: CanvasRenderingContext2D,
  stripCenterX: number,
  centerY: number,
  typeGlyph: string | null,
  dark: boolean,
) {
  if (!typeGlyph) return;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = dark ? "#ffffff" : "#111827";
  let fontPx = 13;
  for (let i = 0; i < 8; i++) {
    ctx.font = `${fontPx}px "Mana", "MPlantin", system-ui, sans-serif`;
    if (ctx.measureText(typeGlyph).width <= TYPE_ICON_DIAM - 4 || fontPx <= 8) break;
    fontPx -= 1;
  }
  ctx.fillText(typeGlyph, stripCenterX, centerY);
  ctx.restore();
}

const MANA_FALLBACK = "12px ui-monospace, monospace";
/** Fixed-size circular costs — matches `.ms-cost` 1.3em glyph box (see `mana.css`). */
const MANA_DIAM = 18;
const MANA_R = MANA_DIAM / 2;
const COST_GAP = 2;
const MANA_SYMBOL_INK = "#111111";

/**
 * Right-aligned mana: true circles, `ms-cost` frame colors, black symbols (like printed cards / filter).
 */
export function drawManaCostRight(
  ctx: CanvasRenderingContext2D,
  rightX: number,
  centerY: number,
  mana: string | null,
  dark: boolean,
): number {
  if (!mana) return 0;
  ctx.save();
  const parts = parseScryfallMana(mana);
  type Seg =
    | { kind: "glyphs"; text: string }
    | { kind: "literal"; text: string; w: number };
  const segs: Seg[] = [];
  for (const p of parts) {
    if (p.glyphs) {
      segs.push({ kind: "glyphs", text: p.glyphs });
    } else if (p.literal) {
      segs.push({
        kind: "literal",
        text: p.literal,
        w: p.literal.length * 5.5,
      });
    }
  }
  if (!segs.length) {
    ctx.restore();
    return 0;
  }

  let totalW = 0;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    totalW += s.kind === "glyphs" ? MANA_DIAM : s.w;
    if (i < segs.length - 1) totalW += COST_GAP;
  }

  let x = rightX - totalW;
  ctx.textBaseline = "middle";

  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    if (s.kind === "glyphs") {
      const cx = x + MANA_R;
      fillManaCostCircle(ctx, cx, centerY, MANA_R, s.text);
      ctx.fillStyle = MANA_SYMBOL_INK;
      let fontPx = 13;
      for (let j = 0; j < 8; j++) {
        ctx.font = `${fontPx}px "Mana", "MPlantin", system-ui, sans-serif`;
        if (ctx.measureText(s.text).width <= MANA_DIAM - 4 || fontPx <= 8) break;
        fontPx -= 1;
      }
      ctx.textAlign = "center";
      ctx.fillText(s.text, cx, centerY);
      ctx.textAlign = "left";
      x += MANA_DIAM;
    } else {
      ctx.font = MANA_FALLBACK;
      ctx.textAlign = "left";
      ctx.fillStyle = dark ? "#94a3b8" : "#64748b";
      ctx.fillText(s.text, x, centerY);
      x += s.w;
    }
    if (i < segs.length - 1) x += COST_GAP;
  }

  ctx.restore();
  return totalW;
}
