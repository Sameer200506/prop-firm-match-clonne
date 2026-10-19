/** Format 100000 -> "$100K", 2500000 -> "$2.5M", 6000 -> "$6K". */
export function formatUsdShort(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `$${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const k = value / 1_000;
    return `$${Number.isInteger(k) ? k : k.toFixed(1)}K`;
  }
  return `$${value}`;
}

/** Format 1035.5 -> "$1,035.50". */
export function formatUsd(value: number): string {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Years a firm has been active, e.g. 2015 -> "11 yrs". */
export function yearsActive(founded: number, now: number = new Date().getFullYear()): number {
  return Math.max(0, now - founded);
}

/** Vertical key -> display label. */
export const verticalLabel: Record<'cfd' | 'futures' | 'both', string> = {
  cfd: 'Forex / CFD',
  futures: 'Futures',
  both: 'FX + Futures',
};
