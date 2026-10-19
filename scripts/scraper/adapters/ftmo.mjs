// FTMO adapter — official site https://ftmo.com
//
// Source page: the public homepage (/en/), which embeds one big JSON config
// blob ("Choose Your FTMO Challenge" widget) containing:
//   - items[0] (USD) challenge balances: 200k / 100k / 50k / 25k / 10k
//   - prices.step_2 / prices.step_1 arrays aligned with those balances
//   - objectives.* (profit target, daily loss, max loss, reward split)
// NOTE: FTMO lists fees in EUR; we store the numbers as published.
import { findEnclosingObject, parseMoney, parsePct } from '../lib/shared.mjs';

export default {
  slug: 'ftmo',
  name: 'FTMO',
  baseUrl: 'https://ftmo.com',
  pages: [{ key: 'home', path: '/en/' }],

  parse(pages) {
    const html = pages.home;
    const anchor = html.indexOf('"prices":{');
    if (anchor < 0) throw new Error('pricing blob not found on ftmo.com homepage');
    const cfg = findEnclosingObject(html, anchor, (o) => o.prices && o.objectives && o.items);
    if (!cfg) throw new Error('could not parse FTMO pricing config');

    const usd = (cfg.items || []).find((i) => i.currency === 'USD');
    if (!usd?.challenges?.length) throw new Error('FTMO USD account list missing');
    const balances = usd.challenges.map((c) => Number(c.balance));
    const step2 = cfg.prices.step_2 || [];
    if (step2.length !== balances.length) throw new Error('FTMO price/balance list mismatch');

    const o = cfg.objectives;
    const profitTargets = [parsePct(o.profit_target?.steps?.step_1), parsePct(o.profit_target?.steps?.step_2)];
    const dailyLossPct = parsePct(o.max_daily_loss?.steps?.step_1);
    const maxLossPct = parsePct(o.max_loss?.steps?.step_1);
    // Base split: "Start with rewards of 80% ... grow up to 90%"
    const splitMatch = String(o.rewards?.short_description || '').match(/rewards of (\d+(?:\.\d+)?)%/);
    const profitSplitPct = splitMatch ? Number(splitMatch[1]) : null;

    const challenges = balances.map((accountSize, i) => {
      const entry = { accountSize, steps: 2 };
      const price = parseMoney(step2[i].price);
      if (price != null) entry.price = price;
      if (step2[i].discounted) {
        const dp = parseMoney(step2[i].discounted_price);
        if (dp != null) entry.discountedPrice = dp;
      }
      if (profitTargets.every((v) => v != null)) entry.profitTargets = profitTargets;
      if (dailyLossPct != null) entry.dailyLossPct = dailyLossPct;
      if (maxLossPct != null) entry.maxLossPct = maxLossPct;
      if (profitSplitPct != null) entry.profitSplitPct = profitSplitPct;
      return entry;
    });

    return { firm: {}, challenges, offers: [] };
  },
};
