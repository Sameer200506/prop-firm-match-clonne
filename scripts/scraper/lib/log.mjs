// JSON-lines failure/activity log for the scraper.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const LOG_DIR = path.join(here, '..', 'logs');
export const LOG_FILE = path.join(LOG_DIR, 'scrape.log');

function ensureDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

export const logger = {
  /** Append one JSON line: timestamp, firm, url, status, outcome, error. */
  log({ firm, url, status, outcome, error }) {
    ensureDir();
    const entry = {
      timestamp: new Date().toISOString(),
      firm: firm ?? null,
      url: url ?? null,
      status: status ?? null,
      outcome,
      error: error ?? null,
    };
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  },
};
