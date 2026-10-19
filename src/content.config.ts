import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob, file } from 'astro/loaders';

/** A trading-rule field: free (true), forbidden (false) or conditionally 'restricted'. */
const ruleEntry = z.union([z.boolean(), z.literal('restricted')]);

const assetClass = z.enum(['fx', 'metals', 'indices', 'energy', 'crypto']);

const firms = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/firms' }),
  schema: z.object({
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
    /** Asset class -> leverage string, e.g. { "fx": "1:100" } */
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
    lastUpdated: z.string(), // ISO date, e.g. '2026-08-24'
    website: z.string(),
    summary: z.string(),
    /** True when figures are approximations pending verification. */
    estimated: z.boolean().default(false),
    /**
     * Scraper bookkeeping, written by `npm run scrape` (scripts/scraper/).
     * Optional so hand-authored firm files stay valid without it.
     */
    scrape: z
      .object({
        lastAttempt: z.string(), // ISO timestamp of the last scrape attempt
        status: z.enum(['updated', 'unchanged', 'blocked', 'failed', 'no-adapter']),
        detail: z.string().optional(),
      })
      .optional(),
  }),
});

const challenges = defineCollection({
  loader: file('./src/content/challenges.json'),
  schema: z.object({
    id: z.string(),
    firm: z.string(), // firm slug
    accountSize: z.number().positive(),
    steps: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    /** Profit target (%) for each step, in order. */
    profitTargets: z.array(z.number()).min(1),
    dailyLossPct: z.number().min(0),
    maxLossPct: z.number().min(0),
    drawdownType: z.enum(['static', 'eod-trailing', 'intraday-trailing', 'balance-based']),
    profitSplitPct: z.number().min(0).max(100),
    payoutFrequency: z.string(),
    price: z.number().min(0),
    discountedPrice: z.number().min(0).optional(),
  }),
});

const offers = defineCollection({
  loader: file('./src/content/offers.json'),
  schema: z.object({
    id: z.string(),
    firm: z.string(), // firm slug
    title: z.string(),
    code: z.string(),
    percentOff: z.number().min(0).max(100),
    expires: z.string().optional(), // ISO date
  }),
});

const reviews = defineCollection({
  loader: file('./src/content/reviews.json'),
  schema: z.object({
    id: z.string(),
    firm: z.string(), // firm slug
    author: z.string(),
    rating: z.number().min(0).max(5),
    title: z.string(),
    body: z.string(),
    date: z.string(), // ISO date
  }),
});

export const collections = { firms, challenges, offers, reviews };
