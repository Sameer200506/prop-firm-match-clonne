// Alpha Capital Group adapter — official site https://alphacapitalgroup.uk
//
// Source page: homepage (/), which embeds an inline script containing the full
// plan catalog as JSON objects with fields:
//   { plan_type: "Alpha pro", name: "Alpha Pro 50K 6%", account_balance: "50000",
//     Price: "237", Max_Daily_Loss: "1500", Max_Loss: "3000",
//     profit_target_in_percent: 6, Profit_Split: "80", steps: 2 }
import * as cheerio from 'cheerio';
import { parseMoney, parsePct, parseSize } from '../lib/shared.mjs';

export default {
  slug: 'alpha-capital-group',
  name: 'Alpha Capital Group',
  baseUrl: 'https://alphacapitalgroup.uk',
  pages: [{ key: 'home', path: '/' }],

  parse(pages) {
    const $ = cheerio.load(pages.home);
    const plans = [];

    $('script').each((_i, el) => {
      const text = $(el).html() || '';
      if (!text.includes('plan_type') || !text.includes('account_balance')) return;

      const rawMatches = text.match(/\{[^{}]*"plan_type"[^{}]*"account_balance"[^{}]*\}/g) || [];
      for (const m of rawMatches) {
        try {
          const parsed = JSON.parse(m);
          if (parsed && parsed.account_balance && parsed.Price) {
            plans.push(parsed);
          }
        } catch {
          // Skip malformed JSON fragments
        }
      }
    });

    if (!plans.length) throw new Error('no Alpha Capital Group plan catalog found in page scripts');

    const challenges = [];
    for (const p of plans) {
      const accountSize = parseSize(p.account_balance);
      const price = parseMoney(p.Price || p.price_alpha_pro_10per);
      const steps = Number(p.steps) || 2;
      if (!accountSize || price == null) continue;

      const entry = { accountSize, steps, price };

      // Derive percentages
      if (p.profit_target_in_percent) {
        const p1 = Number(p.profit_target_in_percent);
        entry.profitTargets = steps === 2 ? [p1, 5] : [p1];
      }
      if (p.Max_Daily_Loss) {
        const dl = parseMoney(p.Max_Daily_Loss);
        if (dl) entry.dailyLossPct = Math.round((dl / accountSize) * 10000) / 100;
      }
      if (p.Max_Loss) {
        const ml = parseMoney(p.Max_Loss);
        if (ml) entry.maxLossPct = Math.round((ml / accountSize) * 10000) / 100;
      }
      if (p.Profit_Split) {
        const split = parsePct(p.Profit_Split);
        if (split) entry.profitSplitPct = split;
      }

      challenges.push(entry);
    }

    if (!challenges.length) throw new Error('no ACG challenge entries parsed');

    return { firm: {}, challenges, offers: [] };
  },
};
