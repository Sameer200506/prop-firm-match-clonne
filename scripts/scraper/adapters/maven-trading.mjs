// Maven Trading adapter — official site https://maventrading.com
//
// Source page: homepage (/), which displays evaluation plan cards with:
//   - Account sizes: 5k, 10k, 25k, 50k, 100k
//   - 1-Step / 2-Step / 3-Step / Instant evaluations
//   - Profit targets, daily loss, max loss, profit split, regular & discounted prices
import * as cheerio from 'cheerio';
import { parseMoney, parsePct, parseSize } from '../lib/shared.mjs';

export default {
  slug: 'maven-trading',
  name: 'Maven Trading',
  baseUrl: 'https://maventrading.com',
  pages: [{ key: 'home', path: '/' }],

  parse(pages) {
    const $ = cheerio.load(pages.home);
    const cards = $('[class*="pricing"], [class*="card"], [class*="plan"]');
    if (!cards.length) throw new Error('no plan cards found on maventrading.com');

    const challenges = [];
    const offers = [];

    // Check for promo codes on page
    const bodyText = $('body').text();
    const couponMatch = bodyText.match(/code\s+([A-Z0-9]{3,10})/i);
    if (couponMatch) {
      const code = couponMatch[1].toUpperCase();
      offers.push({
        code,
        title: `Discount with code ${code}`,
        percentOff: 10,
      });
    }

    cards.each((_i, el) => {
      const text = $(el).text().replace(/\s+/g, ' ');
      const planMatch = text.match(/(?:Standard\s+)?(1|2)-Step\s+\$(\d+k?)\s+account/i);
      if (!planMatch) return;

      const steps = Number(planMatch[1]);
      const accountSize = parseSize(planMatch[2]);
      if (!accountSize) return;

      const priceMatch = text.match(/\$(\d+)\s*\*\s*\$(\d+)/);
      const discountedPrice = priceMatch ? parseMoney(priceMatch[1]) : null;
      const regularPrice = priceMatch ? parseMoney(priceMatch[2]) : null;

      const p1Match = text.match(/Phase 1\s*(\d+)%/i);
      const p2Match = text.match(/Phase 2\s*(\d+)%/i);
      const maxLossMatch = text.match(/Max loss\s*(\d+)%/i);
      const dailyLossMatch = text.match(/Daily loss\s*(\d+)%/i);
      const splitMatch = text.match(/Profit split\s*(\d+)%/i);

      const entry = { accountSize, steps };
      if (regularPrice != null && discountedPrice != null && discountedPrice < regularPrice) {
        entry.price = regularPrice;
        entry.discountedPrice = discountedPrice;
      } else if (regularPrice != null || discountedPrice != null) {
        entry.price = regularPrice || discountedPrice;
      }

      if (p1Match) {
        const p1 = Number(p1Match[1]);
        if (steps === 2 && p2Match) {
          entry.profitTargets = [p1, Number(p2Match[1])];
        } else {
          entry.profitTargets = [p1];
        }
      }

      if (dailyLossMatch) entry.dailyLossPct = Number(dailyLossMatch[1]);
      if (maxLossMatch) entry.maxLossPct = Number(maxLossMatch[1]);
      if (splitMatch) entry.profitSplitPct = Number(splitMatch[1]);

      if (!challenges.some((c) => c.accountSize === entry.accountSize && c.steps === entry.steps)) {
        challenges.push(entry);
      }
    });

    if (!challenges.length) throw new Error('no Maven Trading challenge rows parsed');

    return { firm: {}, challenges, offers };
  },
};
