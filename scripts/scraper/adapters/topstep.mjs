// Topstep adapter — official site https://www.topstep.com
//
// Source page: the homepage, which embeds schema.org JSON-LD describing the
// Trading Combine plans as Product offers:
//   { name: "100K Buying Power Account",
//     description: "... $100,000 buying power, $6,000 profit target, and
//                   $3,000 maximum loss limit.",
//     offers: { price: "99.00", priceCurrency: "USD", priceValidUntil } }
// Percentages are derived from the dollar amounts. Daily loss is not
// published in the JSON-LD, so it is left untouched.
import * as cheerio from 'cheerio';
import { parseMoney, parseSize } from '../lib/shared.mjs';

export default {
  slug: 'topstep',
  name: 'Topstep',
  baseUrl: 'https://www.topstep.com',
  pages: [{ key: 'home', path: '/' }],

  parse(pages) {
    const $ = cheerio.load(pages.home);
    const products = [];
    $('script[type="application/ld+json"]').each((_i, el) => {
      try {
        const data = JSON.parse($(el).html() || '');
        const graph = data['@graph'] ? data['@graph'] : [data];
        for (const node of graph) {
          const catalog = node?.mainEntity?.hasOfferCatalog;
          if (catalog?.itemListElement) products.push(...catalog.itemListElement);
        }
      } catch {
        /* not JSON-LD we care about */
      }
    });
    if (!products.length) throw new Error('no JSON-LD product offers on topstep.com');

    const challenges = [];
    for (const p of products) {
      const size = parseSize(String(p.name || '').replace('Buying Power Account', ''));
      const desc = String(p.description || '');
      const target = parseMoney(desc.match(/([\d,$.]+)\s+profit target/i)?.[1]);
      const maxLoss = parseMoney(desc.match(/([\d,$.]+)\s+maximum loss limit/i)?.[1]);
      const price = parseMoney(p.offers?.price);
      if (!size || price == null) continue;

      const entry = { accountSize: size, steps: 1, price };
      if (target != null) entry.profitTargets = [Math.round((target / size) * 10000) / 100];
      if (maxLoss != null) entry.maxLossPct = Math.round((maxLoss / size) * 10000) / 100;
      challenges.push(entry);
    }
    if (!challenges.length) throw new Error('no Topstep plans parsed from JSON-LD');

    return { firm: {}, challenges, offers: [] };
  },
};
