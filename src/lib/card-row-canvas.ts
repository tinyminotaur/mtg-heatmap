import { fillStyleForManaGlyph, parseScryfallMana } from "@/lib/mana-for-canvas";

const WUBRG = ["W", "U", "B", "R", "G"] as const;

/** Strong fills for the full-height identity strip (slightly richer than pip pastels). */
const STRIP: Record<string, string> = {
  W: "#fde047",
  U: "#38bdf8",
  B: "#64748b",
  R: "#f97316",
  G: "#22c55e",
  C: "#d6d3d1",
};

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

/** Paints the left identity column: full row height, solid or WUBRG-order gradient. */
export function fillIdentityStrip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  identity: string[],
) {
  const order = WUBRG.filter((c) => identity.includes(c));
  if (order.length === 0) {
    ctx.fillStyle = "#78716c";
    ctx.fillRect(x, y, width, height);
    return;
  }
  if (order.length === 1) {
    ctx.fillStyle = STRIP[order[0]] ?? "#78716c";
    ctx.fillRect(x, y, width, height);
    return;
  }
  const g = ctx.createLinearGradient(x, y, x + width, y + height);
  order.forEach((c, i) => {
    g.addColorStop(i / (order.length - 1), STRIP[c] ?? "#78716c");
  });
  ctx.fillStyle = g;
  ctx.fillRect(x, y, width, height);
}

/** Centered type icon on the strip with stroke for contrast on any pip color. */
export function drawTypeGlyphInStrip(
  ctx: CanvasRenderingContext2D,
  stripCenterX: number,
  baselineY: number,
  typeGlyph: string | null,
) {
  if (!typeGlyph) return;
  ctx.save();
  ctx.font = '15px "Mana", "MPlantin", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineJoin = "round";
  ctx.strokeText(typeGlyph, stripCenterX, baselineY);
  ctx.fillStyle = "#f8fafc";
  ctx.fillText(typeGlyph, stripCenterX, baselineY);
  ctx.restore();
}

const MANA_FONT = '13px "Mana", "MPlantin", system-ui, sans-serif';
const MANA_FALLBACK = "12px ui-monospace, monospace";

/** Right-aligned mana; each symbol uses its pip color (Mana font draws the circle art). */
export function drawManaCostRight(
  ctx: CanvasRenderingContext2D,
  rightX: number,
  baselineY: number,
  mana: string | null,
): number {
  if (!mana) return 0;
  const parts = parseScryfallMana(mana);
  const advance = 12;
  let w = 0;
  for (const p of parts) {
    if (p.glyphs) w += p.glyphs.length * advance;
    if (p.literal) w += p.literal.length * 5.5;
  }
  let x = rightX - w;
  for (const p of parts) {
    if (p.glyphs) {
      ctx.font = MANA_FONT;
      for (const ch of p.glyphs) {
        ctx.fillStyle = fillStyleForManaGlyph(ch);
        ctx.fillText(ch, x, baselineY);
        x += advance;
      }
    }
    if (p.literal) {
      ctx.font = MANA_FALLBACK;
      ctx.fillStyle = "#64748b";
      ctx.fillText(p.literal, x, baselineY);
      x += p.literal.length * 5.5;
    }
  }
  return w;
}
