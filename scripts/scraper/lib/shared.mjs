// Shared helpers for the scraper subsystem.

/** Parse a money-ish string ("$1,099.99", "$$549.99", "€439", "1080") into a number. */
export function parseMoney(raw) {
  if (raw == null) return null;
  const s = String(raw);
  // FTMO style: "1 080" or "1.080,50" is not present today, but strip spaces.
  const cleaned = s.replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Parse "$25K" / "$$2.5K" / "100K" / "$1,000,000" into a plain number. */
export function parseSize(raw) {
  if (raw == null) return null;
  const s = String(raw).replace(/[^0-9.,KMkm]/g, '');
  const mult = /[KMkm]$/.test(s) ? (/[Mm]$/.test(s) ? 1_000_000 : 1_000) : 1;
  const n = Number(s.replace(/[KMkm]/g, '').replace(/,/g, ''));
  return Number.isFinite(n) ? n * mult : null;
}

/** Parse "8%", "up to 90%" -> 8 / 90. */
export function parsePct(raw) {
  if (raw == null) return null;
  const m = String(raw).match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

/** Today as ISO date (YYYY-MM-DD). */
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Deep structural equality for JSON-ish values. */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a == null || b == null) return a === b;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object') {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

/**
 * Copy only the keys present in `patch` into `base` (in place).
 * Values that are plain objects merge recursively; arrays and scalars replace.
 * Returns true when anything actually changed.
 */
export function mergePatch(base, patch) {
  let changed = false;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      base[k] !== null &&
      typeof base[k] === 'object' &&
      !Array.isArray(base[k])
    ) {
      if (mergePatch(base[k], v)) changed = true;
    } else if (!deepEqual(base[k], v)) {
      base[k] = v;
      changed = true;
    }
  }
  return changed;
}

/** Canonical JSON stringify (sorted keys) used for change detection / writes. */
export function stableStringify(value, indent = 2) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, sort(v[k])])
      );
    }
    return v;
  };
  return JSON.stringify(sort(value), null, indent) + '\n';
}

/**
 * Extract a balanced JSON object/array starting at index i of str.
 * Tolerates being embedded in HTML/JS payloads.
 */
export function extractBalanced(str, i) {
  const open = str[i];
  if (open !== '{' && open !== '[') throw new Error('not a JSON start');
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < str.length; j++) {
    const c = str[j];
    if (esc) {
      esc = false;
      continue;
    }
    if (inStr) {
      if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return str.slice(i, j + 1);
    }
  }
  throw new Error('unbalanced JSON');
}

/**
 * Walk backwards from `anchor` to find the nearest '{' that parses as a JSON
 * object satisfying `test`. Returns the parsed object or null.
 */
export function findEnclosingObject(str, anchor, test, maxLookback = 400_000) {
  for (let i = anchor; i >= Math.max(0, anchor - maxLookback); i--) {
    if (str[i] !== '{') continue;
    try {
      const obj = JSON.parse(extractBalanced(str, i));
      if (obj && test(obj)) return obj;
    } catch {
      /* not valid JSON from here; keep walking */
    }
  }
  return null;
}

/**
 * Same as findEnclosingObject but for an enclosing JSON array ('[').
 */
export function findEnclosingArray(str, anchor, test, maxLookback = 400_000) {
  for (let i = anchor; i >= Math.max(0, anchor - maxLookback); i--) {
    if (str[i] !== '[') continue;
    try {
      const arr = JSON.parse(extractBalanced(str, i));
      if (Array.isArray(arr) && test(arr)) return arr;
    } catch {
      /* not valid JSON from here; keep walking */
    }
  }
  return null;
}

/** Assemble the React Server Components payload (self.__next_f.push chunks). */
export function assembleNextPayload(html) {
  const re = new RegExp('self\\.__next_f\\.push\\(\\[1,"((?:[^"\\\\]|\\\\.)*)"\\]\\)', 'g');
  let out = '';
  let m;
  while ((m = re.exec(html))) {
    try {
      out += JSON.parse('"' + m[1] + '"');
    } catch {
      /* skip malformed chunk */
    }
  }
  return out;
}
