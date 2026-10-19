#!/usr/bin/env node
// PropFirm Match scraper orchestrator.
//
// Usage:
//   npm run scrape               # fetch live data and write changed files
//   npm run scrape -- --dry-run  # report what WOULD change, write nothing
//   npm run scrape -- --firm=ftmo --firm=topstep   # limit to some slugs
//
// Behaviour summary:
//   * one request at a time, >=2s per-domain delay + jitter (lib/http.mjs)
//   * robots.txt checked per domain before any page fetch (lib/robots.mjs)
//   * Cloudflare/bot blocks -> one retry w/ backoff, then scrape.status='blocked'
//   * every write is validated against the Zod mirror of content.config.ts
//   * files are rewritten ONLY when scraped values actually changed
import fs from 'node:fs';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { enqueueFetch } from './lib/http.mjs';
import { robotsPolicy, isAllowed } from './lib/robots.mjs';
import { logger, LOG_FILE } from './lib/log.mjs';
import { check, firmSchema, challengeSchema, offerSchema } from './lib/schema.mjs';
import { deepEqual, mergePatch, stableStringify, todayISO } from './lib/shared.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const FIRMS_DIR = path.join(root, 'src', 'content', 'firms');
const CHALLENGES_FILE = path.join(root, 'src', 'content', 'challenges.json');
const OFFERS_FILE = path.join(root, 'src', 'content', 'offers.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const onlyFirms = args.filter((a) => a.startsWith('--firm=')).map((a) => a.slice(7));

// ---------------------------------------------------------------- load state
function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const challenges = readJSON(CHALLENGES_FILE);
const offers = readJSON(OFFERS_FILE);
const firmFiles = fs.readdirSync(FIRMS_DIR).filter((f) => f.endsWith('.json'));
const allSlugs = firmFiles.map((f) => f.replace(/\.json$/, '')).sort();

// ---------------------------------------------------------------- adapters
async function loadAdapters() {
  const dir = path.join(here, 'adapters');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.mjs')).sort();
  const adapters = [];
  for (const f of files) {
    const mod = await import(pathToFileURL(path.join(dir, f)).href);
    adapters.push(mod.default);
  }
  return adapters;
}

// ---------------------------------------------------------------- per firm
const results = []; // { firm, status, detail, files: Set<string> }
const writes = new Map(); // absolute path -> { data, label }

function stageWrite(file, data, label) {
  writes.set(file, { data, label });
}

function flushWrites() {
  const written = [];
  for (const [file, { data, label }] of writes) {
    if (!DRY_RUN) fs.writeFileSync(file, stableStringify(data));
    written.push(label);
  }
  return written;
}

// Persist scrape metadata ONLY when it carries new information (a blocked /
// failed state we have not already recorded). Successful runs never rewrite a
// file just to bump bookkeeping — that keeps consecutive runs write-free.
function stageFirmMetaIfNew(firmFile, firmData, scrapeMeta) {
  const prev = firmData.scrape || {};
  if (prev.status === scrapeMeta.status && prev.detail === scrapeMeta.detail) {
    return false;
  }
  mergePatch(firmData, { scrape: scrapeMeta });
  const issue = check(firmSchema, firmData);
  if (issue) {
    logger.log({ firm: firmData.slug, url: null, status: null, outcome: 'validation-error', error: issue });
    return false;
  }
  stageWrite(firmFile, firmData, `firms/${firmData.slug}.json`);
  return true;
}

async function runAdapter(adapter) {
  const slug = adapter.slug;
  const firmFile = path.join(FIRMS_DIR, `${slug}.json`);
  if (!fs.existsSync(firmFile)) {
    logger.log({ firm: slug, url: null, status: null, outcome: 'failed', error: 'no firm JSON file' });
    return { firm: slug, status: 'failed', detail: 'no firm JSON file', files: new Set() };
  }

  const origin = new URL(adapter.baseUrl).origin;
  const policy = await robotsPolicy(origin, slug);

  // robots check for every page up-front
  const urls = adapter.pages.map((p) => ({ key: p.key, url: new URL(p.path, adapter.baseUrl).href }));
  const disallowed = urls.filter((u) => !isAllowed(policy, u.url));
  if (disallowed.length) {
    for (const u of disallowed) {
      logger.log({ firm: slug, url: u.url, status: null, outcome: 'robots-disallowed', error: policy.note });
    }
    return { firm: slug, status: 'failed', detail: `robots.txt disallows ${disallowed[0].url}`, files: new Set() };
  }

  // fetch pages (serial; the queue also guarantees global concurrency 1)
  const pages = {};
  let blocked = false;
  let failed = null;
  for (const u of urls) {
    const res = await enqueueFetch(u.url, { firm: slug });
    if (res.blocked) {
      blocked = true;
      break;
    }
    if (!res.ok) {
      failed = `HTTP ${res.status} on ${u.url}`;
      break;
    }
    pages[u.key] = res.body;
  }

  const firmData = readJSON(firmFile);
  const scrapeMeta = { lastAttempt: new Date().toISOString() };

  if (blocked) {
    scrapeMeta.status = 'blocked';
    scrapeMeta.detail = 'bot protection (Cloudflare/WAF); existing data kept';
    const wrote = stageFirmMetaIfNew(firmFile, firmData, scrapeMeta);
    return { firm: slug, status: 'blocked', detail: scrapeMeta.detail, files: wrote ? new Set([`firms/${slug}.json`]) : new Set() };
  }
  if (failed) {
    logger.log({ firm: slug, url: null, status: null, outcome: 'failed', error: failed });
    scrapeMeta.status = 'failed';
    scrapeMeta.detail = failed;
    const wrote = stageFirmMetaIfNew(firmFile, firmData, scrapeMeta);
    return { firm: slug, status: 'failed', detail: failed, files: wrote ? new Set([`firms/${slug}.json`]) : new Set() };
  }

  // parse
  let parsed;
  try {
    parsed = adapter.parse(pages);
  } catch (err) {
    const msg = String(err?.message || err);
    logger.log({ firm: slug, url: adapter.baseUrl, status: null, outcome: 'parse-error', error: msg });
    scrapeMeta.status = 'failed';
    scrapeMeta.detail = `parse error: ${msg}`;
    mergePatch(firmData, { scrape: scrapeMeta });
    stageWrite(firmFile, firmData, `firms/${slug}.json`);
    return { firm: slug, status: 'failed', detail: msg, files: new Set([`firms/${slug}.json`]) };
  }

  // ---- merge firm-level patch
  let changed = false;
  if (parsed.firm && Object.keys(parsed.firm).length) {
    if (mergePatch(firmData, parsed.firm)) changed = true;
  }

  // ---- merge challenge rows
  let touchedRows = 0;
  for (const patch of parsed.challenges || []) {
    const row = challenges.find(
      (c) => c.firm === slug && c.accountSize === patch.accountSize && c.steps === patch.steps
    );
    if (!row) continue; // never invent rows: missing fields (split/payout) would be fabricated
    const { accountSize, steps, ...fields } = patch;
    const before = JSON.parse(JSON.stringify(row));
    mergePatch(row, fields);
    const issue = check(challengeSchema, row);
    if (issue) {
      // roll back this row and skip the whole firm's writes
      Object.assign(row, before);
      logger.log({ firm: slug, url: null, status: null, outcome: 'validation-error', error: `challenge ${row.id}: ${issue}` });
      scrapeMeta.status = 'failed';
      scrapeMeta.detail = `schema validation failed: ${issue}`;
      const wrote = stageFirmMetaIfNew(firmFile, firmData, scrapeMeta);
      return { firm: slug, status: 'failed', detail: `validation: ${issue}`, files: wrote ? new Set([`firms/${slug}.json`]) : new Set() };
    }
    if (!deepEqual(before, row)) {
      changed = true;
      touchedRows++;
    }
  }

  // ---- merge offers
  let touchedOffers = 0;
  for (const offer of parsed.offers || []) {
    const existing = offers.find((o) => o.firm === slug && o.code === offer.code);
    if (existing) {
      const before = JSON.parse(JSON.stringify(existing));
      mergePatch(existing, {
        title: offer.title,
        percentOff: offer.percentOff,
        ...(offer.expires ? { expires: offer.expires } : {}),
      });
      if (check(offerSchema, existing)) {
        Object.assign(existing, before);
        continue;
      }
      if (!deepEqual(before, existing)) {
        changed = true;
        touchedOffers++;
      }
    } else if (offer.title && typeof offer.percentOff === 'number') {
      const full = {
        id: `offer-${slug}-${offer.code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        firm: slug,
        title: offer.title,
        code: offer.code,
        percentOff: offer.percentOff,
        ...(offer.expires ? { expires: offer.expires } : {}),
      };
      if (!check(offerSchema, full)) {
        offers.push(full);
        changed = true;
        touchedOffers++;
      }
    }
  }

  // ---- finalize
  const files = new Set();
  if (changed) {
    mergePatch(firmData, { lastUpdated: todayISO() });
    mergePatch(firmData, { scrape: { lastAttempt: scrapeMeta.lastAttempt, status: 'updated' } });
    const firmIssue = check(firmSchema, firmData);
    if (firmIssue) {
      logger.log({ firm: slug, url: null, status: null, outcome: 'validation-error', error: firmIssue });
      return { firm: slug, status: 'failed', detail: `firm schema validation failed: ${firmIssue}`, files: new Set() };
    }
    stageWrite(path.join(root, 'src', 'content', 'challenges.json'), challenges, 'challenges.json');
    stageWrite(path.join(root, 'src', 'content', 'offers.json'), offers, 'offers.json');
    stageWrite(firmFile, firmData, `firms/${slug}.json`);
    files.add(`firms/${slug}.json`);
    logger.log({ firm: slug, url: adapter.baseUrl, status: null, outcome: 'updated', error: null });
  } else {
    // 'unchanged' is intentionally NOT persisted: writing bookkeeping alone
    // would make every consecutive run modify files (a no-op change).
    logger.log({ firm: slug, url: adapter.baseUrl, status: null, outcome: 'unchanged', error: null });
  }

  const detail = changed
    ? `${touchedRows} challenge row(s)${touchedOffers ? `, ${touchedOffers} offer(s)` : ''}`
    : 'live data matches stored data';
  return { firm: slug, status: changed ? 'updated' : 'unchanged', detail, files };
}

// ---------------------------------------------------------------- main
const started = Date.now();
console.log(`PropFirm scraper ${DRY_RUN ? '(DRY RUN — nothing will be written)' : ''}`);
console.log(`log file: ${LOG_FILE}\n`);

const adapters = await loadAdapters();
const bySlug = new Map(adapters.map((a) => [a.slug, a]));

const slugs = allSlugs.filter((s) => !onlyFirms.length || onlyFirms.includes(s));
if (onlyFirms.length) {
  for (const s of onlyFirms.filter((x) => !allSlugs.includes(x))) {
    console.log(`!! unknown firm slug: ${s}`);
  }
}

for (const slug of slugs) {
  const adapter = bySlug.get(slug);
  if (!adapter) {
    logger.log({ firm: slug, url: null, status: null, outcome: 'no-adapter', error: null });
    results.push({ firm: slug, status: 'no-adapter', detail: 'no adapter', files: new Set() });
    console.log(`  - ${slug}: no adapter, skipping`);
    continue;
  }
  const r = await runAdapter(adapter);
  results.push(r);
  console.log(`  - ${slug}: ${r.status} (${r.detail})`);
}

flushWrites();

// ---------------------------------------------------------------- summary
const pad = (s, n) => String(s).padEnd(n);
console.log('\n================ SUMMARY ================');
console.log(pad('firm', 24) + pad('status', 12) + 'detail');
console.log('-'.repeat(80));
for (const r of results) {
  console.log(pad(r.firm, 24) + pad(r.status, 12) + r.detail);
}
console.log('-'.repeat(80));
const count = (st) => results.filter((r) => r.status === st).length;
console.log(
  `updated: ${count('updated')}  unchanged: ${count('unchanged')}  blocked: ${count('blocked')}  ` +
    `failed: ${count('failed')}  no-adapter: ${count('no-adapter')}`
);
console.log(DRY_RUN ? '\nWould-be file writes:' : '\nFiles modified:');
if (writes.size) {
  for (const label of new Set([...writes.values()].map((w) => w.label))) console.log(`  * src/content/${label}`);
} else {
  console.log('  (none)');
}
if (DRY_RUN) console.log('\nDRY RUN: no files were written.');
console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
