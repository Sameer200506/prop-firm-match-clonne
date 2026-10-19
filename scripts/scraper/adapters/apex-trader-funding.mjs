// Apex Trader Funding adapter — official site https://apextraderfunding.com
//
// Like E8 and FundingPips, apextraderfunding.com uses Cloudflare bot
// mitigation. This parser runs when requests are served directly, extracting
// evaluation plans ($25K, $50K, $100K, $150K, $250K, $300K) and coupon discounts.
import * as cheerio from 'cheerio';
import { parseMoney, parsePct, parseSize } from '../lib/shared.mjs';

export default {
  slug: 'apex-trader-funding',
  name: 'Apex Trader Funding',
  baseUrl: 'https://apextraderfunding.com',
  pages: [{ key: 'home', path: '/' }],

  parse(pages) {
    const html = pages.home;
    const $ = cheerio.load(html);

    const challenges = [];
    const offers = [];

    // Coupon code extraction (e.g. "80% OFF WITH CODE APEX80" / "SAVE 80%")
    const bodyText = $('body').text();
    const couponMatch = bodyText.match(/(?:code|use code)\s+([A-Z0-9]{3,12})/i);
    const offMatch = bodyText.match(/(\d+)%\s+off/i);
    if (couponMatch) {
      const code = couponMatch[1].toUpperCase();
      const percentOff = offMatch ? Number(offMatch[1]) : 80;
      offers.push({
        code,
        title: `Apex ${percentOff}% Off Promo`,
        percentOff,
      });
    }

    // Parse plan cards or pricing rows
    $('[class*="plan"], [class*="pricing"], [class*="card"], tr').each((_i, el) => {
      const text = $(el).text().replace(/\s+/g, ' ');
      const sizeMatch = text.match(/\$(\d+k?)\s*(?:account|contract|trailing|evaluation)/i);
      if (!sizeMatch) return;

      const accountSize = parseSize(sizeMatch[1]);
      const priceMatch = text.match(/\$(\d+(?:\.\d+)?)/);
      const price = priceMatch ? parseMoney(priceMatch[1]) : null;
      if (!accountSize || price == null) return;

      const targetMatch = text.match(/profit target\s*\$?([\d,]+)/i);
      const maxLossMatch = text.match(/(?:trailing|drawdown|max loss)\s*\$?([\d,]+)/i);

      const entry = { accountSize, steps: 1, price };
      if (targetMatch) {
        const pt = parseMoney(targetMatch[1]);
        if (pt) entry.profitTargets = [Math.round((pt / accountSize) * 10000) / 100];
      }
      if (maxLossMatch) {
        const ml = parseMoney(maxLossMatch[1]);
        if (ml) {
          entry.maxLossPct = Math.round((ml / accountSize) * 10000) / 100;
          entry.drawdownType = 'intraday-trailing';
        }
      }

      if (!challenges.some((c) => c.accountSize === entry.accountSize && c.steps === entry.steps)) {
        challenges.push(entry);
      }
    });

    return { firm: {}, challenges, offers };
  },
};
