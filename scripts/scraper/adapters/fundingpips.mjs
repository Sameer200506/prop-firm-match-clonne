// FundingPips adapter — official site https://fundingpips.com
//
// fundingpips.com sits behind Vercel's bot protection ("Vercel Security
// Checkpoint", HTTP 429) for plain HTTP clients, so today the orchestrator
// records scrape.status='blocked' and leaves the stored data untouched.
// The parser below runs if the site ever serves the pricing page directly:
// it scans for embedded plan JSON (account size + fee pairs).
import { findEnclosingObject, parseMoney, parsePct, parseSize } from '../lib/shared.mjs';

export default {
  slug: 'fundingpips',
  name: 'FundingPips',
  baseUrl: 'https://fundingpips.com',
  pages: [{ key: 'pricing', path: '/pricing' }],

  parse(pages) {
    const html = pages.pricing;
    const anchor = html.search(/"account_?size"|"programName"|"challengeType"/i);
    if (anchor < 0) throw new Error('no plan data found on fundingpips.com pricing page');
    const plan = findEnclosingObject(
      html,
      anchor,
      (o) => (o.accountSize || o.account_size) && (o.price || o.fee),
      100_000
    );
    if (!plan) throw new Error('could not parse FundingPips plan data');
    const accountSize = parseSize(plan.accountSize || plan.account_size);
    const price = parseMoney(plan.price || plan.fee);
    if (!accountSize || price == null) throw new Error('FundingPips plan fields incomplete');
    const entry = { accountSize, steps: plan.steps || 2, price };
    const target = parsePct(plan.profitTarget || plan.profit_target);
    if (target != null) entry.profitTargets = [target];
    const daily = parsePct(plan.dailyLoss || plan.daily_loss);
    if (daily != null) entry.dailyLossPct = daily;
    const maxLoss = parsePct(plan.maxLoss || plan.max_loss);
    if (maxLoss != null) entry.maxLossPct = maxLoss;
    return { firm: {}, challenges: [entry], offers: [] };
  },
};
