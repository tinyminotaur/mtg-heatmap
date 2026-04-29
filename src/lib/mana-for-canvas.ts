/** Private-use glyphs from Mana font (see node_modules/mana-font/css/mana.css ::before content). */

const U = (code: number) => String.fromCharCode(code);

const BASIC: Record<string, string> = {
  w: U(0xe600),
  u: U(0xe601),
  b: U(0xe602),
  r: U(0xe603),
  g: U(0xe604),
  c: U(0xe904),
  s: U(0xe619),
  x: U(0xe615),
  y: U(0xe616),
  z: U(0xe617),
  t: U(0xe61a),
  e: U(0xe907),
  h: U(0xe618),
  p: U(0xe618),
};

const DIGIT: Record<string, string> = {
  "0": U(0xe605),
  "1": U(0xe606),
  "2": U(0xe607),
  "3": U(0xe608),
  "4": U(0xe609),
  "5": U(0xe60a),
  "6": U(0xe60b),
  "7": U(0xe60c),
  "8": U(0xe60d),
  "9": U(0xe60e),
};

const NUMERIC_SYMBOL: Record<string, string> = {
  "10": U(0xe60f),
  "11": U(0xe610),
  "12": U(0xe611),
  "13": U(0xe612),
  "14": U(0xe613),
  "15": U(0xe614),
  "16": U(0xe62a),
  "17": U(0xe62b),
  "18": U(0xe62c),
  "19": U(0xe62d),
  "20": U(0xe62e),
  "100": U(0xe900),
};

/** Two-color hybrid (guild) — uses “top” half glyph from Mana CSS. */
const HYBRID: Record<string, string> = {
  wu: U(0xe600),
  wb: U(0xe600),
  ub: U(0xe601),
  ur: U(0xe601),
  br: U(0xe602),
  bg: U(0xe602),
  rw: U(0xe603),
  rg: U(0xe603),
  gw: U(0xe604),
  gu: U(0xe604),
};

/** {2/W} / {C/R} style — single hybrid circle glyph from Mana. */
const HYBRID_GENERIC = U(0xe607);

function digitsOnlyGlyphs(t: string): string {
  let out = "";
  for (const ch of t) {
    out += DIGIT[ch] ?? ch;
  }
  return out;
}

/** Map one Scryfall `{…}` inner token to Mana PUA string (may be multiple chars). */
export function mapManaToken(inner: string): string | null {
  const raw = inner.trim();
  const t = raw.toLowerCase();

  if (BASIC[t]) return BASIC[t];

  if (NUMERIC_SYMBOL[t]) return NUMERIC_SYMBOL[t];

  if (/^\d+$/.test(t)) {
    if (t.length <= 2 && NUMERIC_SYMBOL[t]) return NUMERIC_SYMBOL[t];
    return digitsOnlyGlyphs(t);
  }

  if (t === "∞" || t === "infinity") return U(0xe903);

  const phy = t.match(/^([wubrgc])\/p$/);
  if (phy) return BASIC.p;

  const guild = t.replace(/\//g, "");
  if (t.includes("/") && guild.length === 2 && /^[wubrg]{2}$/.test(guild)) {
    return HYBRID[guild] ?? null;
  }

  const dc = t.match(/^(\d+)\/([wubrgc])$/);
  if (dc) return HYBRID_GENERIC;

  const cd = t.match(/^([wubrgc])\/(\d+)$/);
  if (cd) return HYBRID_GENERIC;

  if (t.length === 2 && HYBRID[t]) return HYBRID[t];

  if (t.includes("/")) return HYBRID_GENERIC;

  return null;
}

/** Full `{W}{2}{U/R}` mana string → glyphs; unknown tokens become `null` entries for fallback drawing. */
export function parseScryfallMana(mana: string | null): { glyphs: string | null; literal: string | null }[] {
  if (!mana) return [];
  const out: { glyphs: string | null; literal: string | null }[] = [];
  const re = /\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(mana)) !== null) {
    if (m.index > last) {
      out.push({ glyphs: null, literal: mana.slice(last, m.index) });
    }
    const inner = m[1] ?? "";
    const g = mapManaToken(inner);
    if (g) out.push({ glyphs: g, literal: null });
    else out.push({ glyphs: null, literal: `{${inner}}` });
    last = m.index + m[0].length;
  }
  if (last < mana.length) out.push({ glyphs: null, literal: mana.slice(last) });
  return out;
}

/**
 * Background for a single mana cost “pill” (matches `mana.css` `.ms-cost` + `.ms-cost.ms-w` …).
 * Use the first code point; hybrid / multi-glyph strings fall back to default grey.
 */
export function msCostCircleBackground(glyphs: string): string {
  if (!glyphs) return "#beb9b2";
  const cp = glyphs.codePointAt(0);
  if (cp === undefined) return "#beb9b2";
  switch (cp) {
    case 0xe600:
      return "#f0f2c0";
    case 0xe601:
      return "#b5cde3";
    case 0xe602:
      return "#aca29a";
    case 0xe603:
      return "#db8664";
    case 0xe604:
      return "#93b483";
    case 0xe904:
      return "#beb9b2";
    case 0xe615:
    case 0xe616:
    case 0xe617:
    case 0xe61a:
      return "#beb9b2";
    case 0xe619:
      return "#e2e8f0";
    case 0xe618:
      return "#ddd6fe";
    case 0xe907:
      return "#fef3c7";
    case 0xe903:
      return "#beb9b2";
    case 0xe607:
      return "#beb9b2";
    default:
      if ((cp >= 0xe605 && cp <= 0xe614) || (cp >= 0xe62a && cp <= 0xe62e) || cp === 0xe900 || cp === 0xe901) {
        return "#beb9b2";
      }
      return "#beb9b2";
  }
}

/** Hybrid / split mana glyph — canvas analogue of `.ms-cost` diagonal gradient (generic two-tone). */
export function fillManaCostCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  glyphs: string,
): void {
  const cp = glyphs.codePointAt(0);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  if (cp === 0xe607) {
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, "#f0f2c0");
    g.addColorStop(1, "#b5cde3");
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = msCostCircleBackground(glyphs);
  }
  ctx.fill();
}
