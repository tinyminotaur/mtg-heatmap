"use client";

const sym: Record<string, string> = {
  W: "ms-w",
  U: "ms-u",
  B: "ms-b",
  R: "ms-r",
  G: "ms-g",
  C: "ms-c",
  X: "ms-x",
  Y: "ms-y",
  Z: "ms-z",
};

function tokenToClass(t: string): string | null {
  const k = t.toUpperCase();
  if (/^\d+$/.test(k)) return "ms-0"; // simplified: use generic for numbers
  return sym[k] ?? null;
}

export function ManaCost({ cost }: { cost: string | null }) {
  if (!cost) return null;
  const parts: { type: "sym"; cls: string }[] = [];
  const re = /\{([^/}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cost)) !== null) {
    const inner = m[1];
    const phy = inner.split("/")[0];
    const cls = tokenToClass(phy);
    if (cls) parts.push({ type: "sym", cls });
  }
  if (!parts.length) {
    return <span className="font-mono text-xs text-muted-foreground">{cost}</span>;
  }
  return (
    <span className="mana-symbols inline-flex items-center gap-0.5 align-middle">
      {parts.map((p, i) => (
        <i key={i} className={`ms ${p.cls} ms-cost ms-shadow`} aria-hidden />
      ))}
    </span>
  );
}
