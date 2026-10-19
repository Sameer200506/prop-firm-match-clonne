// E8 Markets adapter — official site https://e8markets.com
//
// The public pricing page is served behind Cloudflare bot management; at the
// time of writing plain HTTP fetches receive a 403 challenge, which the
// orchestrator records as scrape.status='blocked' (existing data kept).
// The parser below is what WILL run if the page ever serves real HTML: it
// looks for embedded plan objects ({ accountSize/size + price/fee pairs }).
import { findEnclosingObject, parseMoney, parsePct, parseSize } from '../lib/shared.mjs';

export default {
  slug: 'e8-markets',
  name: 'E8 Markets',
  baseUrl: 'https://e8markets.com',
  pages: [{ key: 'pricing', path: '/pricing' }],

  parse(pages) {
    const html = pages.pricing;
    const anchor = html.search(/"account_?size"|numericAccountSize|"planName"/i);
    if (anchor < 0) throw new Error('no plan data found on e8markets.com pricing page');
    const plan = findEnclosingObject(
      html,
      anchor,
      (o) => (o.accountSize || o.account_size || o.planName) && (o.price || o.fee),
      100_000
    );
    if (!plan) throw new Error('could not parse E8 Markets plan data');
    // Best-effort generic mapping (site currently unreachable, so this path
    // is defensive by design).
    const accountSize = parseSize(plan.accountSize || plan.account_size);
    const price = parseMoney(plan.price || plan.fee);
    if (!accountSize || price == null) throw new Error('E8 Markets plan fields incomplete');
    const entry = { accountSize, steps: 1, price };
    const target = parsePct(plan.profitTarget || plan.profit_target);
    if (target != null) entry.profitTargets = [target];
    const daily = parsePct(plan.dailyLoss || plan.daily_loss);
    if (daily != null) entry.dailyLossPct = daily;
    const maxLoss = parsePct(plan.maxLoss || plan.max_loss);
    if (maxLoss != null) entry.maxLossPct = maxLoss;
    return { firm: {}, challenges: [entry], offers: [] };
  },
};
