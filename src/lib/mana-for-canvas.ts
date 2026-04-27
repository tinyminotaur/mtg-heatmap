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

/** Canvas `fillStyle` for one Mana-font PUA glyph (matches in-circle feel from mana.css pip colors). */
export function fillStyleForManaGlyph(ch: string): string {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return "#94a3b8";
  switch (cp) {
    case 0xe600:
      return "#fef08a";
    case 0xe601:
      return "#7dd3fc";
    case 0xe602:
      return "#94a3b8";
    case 0xe603:
      return "#fb923c";
    case 0xe604:
      return "#4ade80";
    case 0xe904:
      return "#d4d0c8";
    case 0xe619:
      return "#e2e8f0";
    case 0xe615:
    case 0xe616:
    case 0xe617:
      return "#a8a29e";
    case 0xe61a:
      return "#cbd5e1";
    case 0xe907:
      return "#fbbf24";
    case 0xe618:
      return "#c4b5fd";
    case 0xe903:
      return "#94a3b8";
    case 0xe607:
      return "#d4a84b";
    default:
      if ((cp >= 0xe605 && cp <= 0xe614) || (cp >= 0xe62a && cp <= 0xe62e) || cp === 0xe900 || cp === 0xe901) {
        return "#e2e8f0";
      }
      return "#cbd5e1";
  }
}
