// Funded Trading Plus adapter — official site https://fundedtradingplus.com
//
// Behind Cloudflare bot mitigation. Defensive parser extracts Master Trader /
// Experienced Trader plans ($12.5K ... $200K) when direct access is granted.
import * as cheerio from 'cheerio';
import { parseMoney, parsePct, parseSize } from '../lib/shared.mjs';

export default {
  slug: 'funded-trading-plus',
  name: 'Funded Trading Plus',
  baseUrl: 'https://fundedtradingplus.com',
  pages: [{ key: 'home', path: '/' }],

  parse(pages) {
    const $ = cheerio.load(pages.home);
    const challenges = [];
    const offers = [];

    $('[class*="pricing"], [class*="card"], [class*="plan"], tr').each((_i, el) => {
      const text = $(el).text().replace(/\s+/g, ' ');
      const sizeMatch = text.match(/\$(\d+k?|\d+,\d+)\s*(?:account|plan|evaluation)/i);
      if (!sizeMatch) return;

      const accountSize = parseSize(sizeMatch[1]);
      const priceMatch = text.match(/\$(\d+(?:\.\d+)?)/);
      const price = priceMatch ? parseMoney(priceMatch[1]) : null;
      if (!accountSize || price == null) return;

      const steps = text.toLowerCase().includes('experienced') ? 1 : 2;
      const targetMatch = text.match(/profit target\s*(\d+)%/i);
      const ddMatch = text.match(/(?:trailing|drawdown|max loss)\s*(\d+)%/i);
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
