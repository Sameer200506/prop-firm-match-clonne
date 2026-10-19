// Minimal robots.txt checker.
//
// Policy (documented decision): we only honour `User-agent: *` rules plus a
// specific block for our own token (propfirmmatchbot). If fetching robots.txt
// fails with a network error we treat the site as "allow with caution"
// (log a warning) — a missing robots.txt is not a disallow. A 4xx robots.txt
// response likewise means "no rules".
import { enqueueFetch } from './http.mjs';

const cache = new Map(); // origin -> { rules: [{path, allow}], ok }

function parseRobots(text) {
  // Split into agent-groups; keep rules for '*' and our bot token.
  const groups = []; // { agents: [], rules: [{allow, path}] }
  let current = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if ((key === 'disallow' || key === 'allow') && current) {
      if (value) current.rules.push({ allow: key === 'allow', path: value });
    }
  }
  const wanted = groups.filter(
    (g) => g.agents.includes('*') || g.agents.includes('propfirmmatchbot')
  );
  const rules = [];
  for (const g of wanted) rules.push(...g.rules);
  // Later, more specific rules win; on equal length the last one wins.
  rules.sort((a, b) => a.path.length - b.path.length);
  return rules;
}

export async function robotsPolicy(origin, firm) {
  if (cache.has(origin)) return cache.get(origin);
  const res = await enqueueFetch(origin + '/robots.txt', { firm, retries: 0 });
  let policy;
  if (res.blocked) {
    // robots.txt itself gated: assume "allow with caution" and record it.
    policy = { rules: [], note: 'robots.txt blocked; allowing with caution' };
  } else if (!res.ok || res.status === 404 || res.status === 403) {
    policy = { rules: [], note: res.ok ? 'no relevant rules' : `robots.txt HTTP ${res.status}; allowing with caution` };
  } else {
    policy = { rules: parseRobots(res.body), note: 'parsed' };
  }
  cache.set(origin, policy);
  return policy;
}

/** True when the path may be fetched per robots rules. */
export function isAllowed(policy, url) {
  const path = new URL(url).pathname || '/';
  let allowed = true;
  for (const rule of policy.rules) {
    // robots paths are plain prefixes (no wildcards supported in this parser).
    if (rule.path.endsWith('$')) {
      if (path === rule.path.slice(0, -1)) allowed = rule.allow;
    } else if (path.startsWith(rule.path)) {
      allowed = rule.allow;
    }
  }
  return allowed;
}
