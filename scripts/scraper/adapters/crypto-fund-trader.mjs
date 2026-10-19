// Crypto Fund Trader adapter — official site https://cryptofundtrader.com
//
// Source page: homepage (/), which displays multi-asset & crypto evaluation plans
// from $5K up to $300K with 1-step and 2-step evaluation structures.
import * as cheerio from 'cheerio';
import { parseMoney, parsePct, parseSize } from '../lib/shared.mjs';

export default {
  slug: 'crypto-fund-trader',
  name: 'Crypto Fund Trader',
  baseUrl: 'https://cryptofundtrader.com',
  pages: [{ key: 'home', path: '/' }],

  parse(pages) {
    const $ = cheerio.load(pages.home);
    const challenges = [];
    const offers = [];

    // Extract promo offers if present
    const bodyText = $('body').text();
    const couponMatch = bodyText.match(/(?:code|use code)\s+([A-Z0-9]{3,10})/i);
    if (couponMatch) {
      offers.push({
        code: couponMatch[1].toUpperCase(),
        title: `Promo discount with code ${couponMatch[1].toUpperCase()}`,
        percentOff: 10,
      });
    }

    $('[class*="plan"], [class*="card"], [class*="pricing"], [class*="tier"]').each((_i, el) => {
      const text = $(el).text().replace(/\s+/g, ' ');
      const sizeMatch = text.match(/\$(\d+k?|\d+,\d+)\s*(?:account|plan|evaluation)/i);
      if (!sizeMatch) return;

      const accountSize = parseSize(sizeMatch[1]);
      const priceMatch = text.match(/\$(\d+(?:\.\d+)?)/);
      const price = priceMatch ? parseMoney(priceMatch[1]) : null;
      if (!accountSize || price == null) return;

      const steps = text.toLowerCase().includes('1-step') ? 1 : 2;
      const targetMatch = text.match(/profit target\s*(\d+)%/i);
      const ddMatch = text.match(/(?:drawdown|max loss)\s*(\d+)%/i);
      const dlMatch = text.match(/daily loss\s*(\d+)%/i);

      const entry = { accountSize, steps, price };
      if (targetMatch) entry.profitTargets = [Number(targetMatch[1])];
      if (ddMatch) entry.maxLossPct = Number(ddMatch[1]);
      if (dlMatch) entry.dailyLossPct = Number(dlMatch[1]);

      if (!challenges.some((c) => c.accountSize === entry.accountSize && c.steps === entry.steps)) {
        challenges.push(entry);
      }
    });

    return { firm: {}, challenges, offers };
  },
};
