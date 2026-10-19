// Zod mirror of the collections defined in src/content.config.ts.
//
// src/content.config.ts imports `astro:content`, which plain Node cannot load,
// so this file replicates the schemas 1:1 as a pre-write validation layer.
// KEEP IN SYNC with src/content.config.ts — any drift here is caught at build
// time anyway, because `astro build` re-validates every JSON file we write.
import { z } from 'zod';

/** A trading-rule field: free (true), forbidden (false) or conditionally 'restricted'. */
const ruleEntry = z.union([z.boolean(), z.literal('restricted')]);

const assetClass = z.enum(['fx', 'metals', 'indices', 'energy', 'crypto']);

export const firmSchema = z.object({
  slug: z.string(),
  name: z.string(),
  logoInitials: z.string(),
  vertical: z.enum(['cfd', 'futures', 'both']),
  country: z.string(),
  founded: z.number().int(),
  rating: z.number().min(0).max(5),
  reviewCount: z.number().int().nonnegative(),
  platforms: z.array(z.string()).default([]),
  assets: z.array(assetClass).default([]),
  payoutMethods: z.array(z.string()).default([]),
  leverage: z.record(z.string(), z.string()).default({}),
  rules: z
    .object({
      newsTrading: ruleEntry,
      eas: ruleEntry,
      overnight: ruleEntry,
      swapFree: ruleEntry,
    })
    .default({ newsTrading: true, eas: true, overnight: true, swapFree: false }),
  restrictedCountries: z.array(z.string()).default([]),
  discount: z
    .object({
      code: z.string(),
      percentOff: z.number().min(0).max(100),
    })
    .optional(),
  maxAllocation: z.number().positive(),
  scalingCap: z.number().positive().optional(),
  lastUpdated: z.string(),
  website: z.string(),
  summary: z.string(),
  estimated: z.boolean().default(false),
  /** Scraper bookkeeping (optional so hand-written files stay valid). */
  scrape: z
    .object({
      lastAttempt: z.string(),
      status: z.enum(['updated', 'unchanged', 'blocked', 'failed', 'no-adapter']),
      detail: z.string().optional(),
    })
    .optional(),
});

export const challengeSchema = z.object({
  id: z.string(),
  firm: z.string(),
  accountSize: z.number().positive(),
  steps: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  profitTargets: z.array(z.number()).min(1),
  dailyLossPct: z.number().min(0),
  maxLossPct: z.number().min(0),
  drawdownType: z.enum(['static', 'eod-trailing', 'intraday-trailing', 'balance-based']),
  profitSplitPct: z.number().min(0).max(100),
  payoutFrequency: z.string(),
  price: z.number().min(0),
  discountedPrice: z.number().min(0).optional(),
});

export const offerSchema = z.object({
  id: z.string(),
  firm: z.string(),
  title: z.string(),
  code: z.string(),
  percentOff: z.number().min(0).max(100),
  expires: z.string().optional(),
});

/** Returns null when valid, otherwise the first issue message. */
export function check(schema, value) {
  const res = schema.safeParse(value);
  if (res.success) return null;
  const issue = res.error.issues?.[0];
  return issue ? `${issue.path.join('.')}: ${issue.message}` : 'invalid';
}
