// Polite HTTP client: per-domain rate limiting (concurrency 1), jitter,
// bot-protection detection and a single retry after backoff.
import { logger } from './log.mjs';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0 Safari/537.36 PropFirmMatchBot/1.0 (data-quality research)';

/** Minimum delay between requests to the same domain. Override: SCRAPE_DELAY_MS. */
const MIN_DELAY_MS = Number(process.env.SCRAPE_DELAY_MS || 2000);
/** Random extra jitter added to every delay. */
const JITTER_MS = Number(process.env.SCRAPE_JITTER_MS || 500);
/** Backoff before the single allowed retry. */
const RETRY_BACKOFF_MS = Number(process.env.SCRAPE_RETRY_BACKOFF_MS || 5000);
const TIMEOUT_MS = Number(process.env.SCRAPE_TIMEOUT_MS || 30000);

const lastRequestAt = new Map(); // origin -> epoch ms
let globalChain = Promise.resolve(); // total concurrency = 1

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rateLimitedFetch(url, opts = {}) {
  const origin = new URL(url).origin;
  const now = Date.now();
  const wait = (lastRequestAt.get(origin) || 0) + MIN_DELAY_MS + Math.random() * JITTER_MS - now;
  if (wait > 0) await sleep(wait);
  lastRequestAt.set(origin, Date.now());
  return fetch(url, {
    redirect: 'follow',
    ...opts,
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      ...(opts.headers || {}),
    },
    signal: AbortSignal.timeout(opts.timeoutMs || TIMEOUT_MS),
  });
}

/**
 * Detect Cloudflare-style bot challenges: 403/503/429 + cf headers or
 * well-known challenge markers in the body.
 */
export function looksBlocked(status, headers, body = '') {
  if (![403, 429, 503].includes(status)) return false;
  const cfSignals = ['cf-mitigated', 'cf-chl', 'cf-ray'];
  const server = (headers.get('server') || '').toLowerCase();
  const headerHit =
    server === 'cloudflare' || cfSignals.some((h) => headers.get(h) != null);
  const bodyHit =
    /cf-challenge|challenge-platform|cf-turnstile|just a moment|attention required|vercel security checkpoint|cloudflare/i.test(
      body.slice(0, 5000)
    );
  return headerHit || bodyHit;
}

/**
 * GET a URL politely. Returns { ok, status, body, blocked, error }.
 * At most ONE retry after backoff on transient/blocked failures.
 */
export async function getPolite(url, { firm = '-', retries = 1 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await rateLimitedFetch(url);
      const body = await res.text();
      if (looksBlocked(res.status, res.headers, body)) {
        logger.log({ firm, url, status: res.status, outcome: 'blocked', error: 'bot-protection detected' });
        if (attempt < retries) {
          await sleep(RETRY_BACKOFF_MS);
          continue; // exactly one retry, then give up
        }
        return { ok: false, blocked: true, status: res.status, body: '' };
      }
      if (!res.ok) {
        logger.log({ firm, url, status: res.status, outcome: 'http-error', error: `HTTP ${res.status}` });
        if (attempt < retries && res.status >= 500) {
          await sleep(RETRY_BACKOFF_MS);
          continue;
        }
        return { ok: false, blocked: false, status: res.status, body };
      }
      logger.log({ firm, url, status: res.status, outcome: 'fetched', error: null });
      return { ok: true, blocked: false, status: res.status, body };
    } catch (err) {
      logger.log({ firm, url, status: null, outcome: 'fetch-error', error: String(err?.message || err) });
      if (attempt < retries) {
        await sleep(RETRY_BACKOFF_MS);
        continue;
      }
      return { ok: false, blocked: false, status: null, body: '', error: String(err?.message || err) };
    }
  }
  return { ok: false, blocked: false, status: null, body: '', error: 'unreachable' };
}

/** Serialize all fetches through one queue (total concurrency 1). */
export function enqueueFetch(url, opts) {
  const run = globalChain.then(() => getPolite(url, opts));
  globalChain = run.catch(() => {});
  return run;
}
