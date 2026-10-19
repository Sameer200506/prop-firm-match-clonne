// Tradeify adapter — official site https://tradeify.co
//
// Source page: homepage (/), which displays evaluation plan cards with:
//   - Account sizes: 25K, 50K, 100K, 150K
//   - Profit targets, daily loss limits, EOD trailing max drawdown, and prices
import * as cheerio from 'cheerio';
import { parseMoney, parseSize } from '../lib/shared.mjs';

export default {
  slug: 'tradeify',
  name: 'Tradeify',
  baseUrl: 'https://tradeify.co',
  pages: [{ key: 'home', path: '/' }],

  parse(pages) {
    const $ = cheerio.load(pages.home);
    const cards = $('.prt-col-grid-v2, .prt-card-wrapper');
    if (!cards.length) throw new Error('no pricing cards found on tradeify.co');

    const challenges = [];
    const offers = [];

    // Check for promo code in hero or card footer ("code DASH")
    const fullText = $('body').text();
    const couponMatch = fullText.match(/code\s+([A-Z0-9]{3,10})/i);
    if (couponMatch) {
      const code = couponMatch[1].toUpperCase();
      offers.push({
        code,
        title: `Discount with code ${code}`,
        percentOff: 20,
      });
    }

    cards.each((_i, el) => {
      const text = $(el).text().replace(/\s+/g, ' ');
      const titleMatch = text.match(/(\d+K)\s+Evaluation/i);
      if (!titleMatch) return;

      const accountSize = parseSize(titleMatch[1]);
      if (!accountSize) return;

      const priceMatch = text.match(/\$(\d+)\s*\$(\d+)/);
      const regularPrice = priceMatch ? parseMoney(priceMatch[1]) : null;
      const discountedPrice = priceMatch ? parseMoney(priceMatch[2]) : null;

      const dlMatch = text.match(/Daily Loss Limit\s*\$(\d[\d,]*)/i);
      const ddMatch = text.match(/(?:Trailing Max Drawdown|Drawdown)\s*(?:\(EOD\))?\s*\$(\d[\d,]*)/i);
      const ptMatch = text.match(/Profit Target\s*(?:\?[^$]*)?\$(\d[\d,]*)/i);

      const entry = { accountSize, steps: 1 };
      if (regularPrice != null && discountedPrice != null && discountedPrice < regularPrice) {
        entry.price = regularPrice;
        entry.discountedPrice = discountedPrice;
      } else if (regularPrice != null || discountedPrice != null) {
        entry.price = regularPrice || discountedPrice;
      }

      if (dlMatch) {
        const dl = parseMoney(dlMatch[1]);
        if (dl) entry.dailyLossPct = Math.round((dl / accountSize) * 10000) / 100;
      }
      if (ddMatch) {
        const dd = parseMoney(ddMatch[1]);
        if (dd) {
          entry.maxLossPct = Math.round((dd / accountSize) * 10000) / 100;
          entry.drawdownType = 'eod-trailing';
        }
      }
      if (ptMatch) {
        const pt = parseMoney(ptMatch[1]);
        if (pt && pt > 0) entry.profitTargets = [Math.round((pt / accountSize) * 10000) / 100];
      }

      if (!challenges.some((c) => c.accountSize === entry.accountSize && c.steps === entry.steps)) {
        challenges.push(entry);
      }
    });

    if (!challenges.length) throw new Error('no Tradeify challenge rows parsed');

    return { firm: {}, challenges, offers };
  },
};
