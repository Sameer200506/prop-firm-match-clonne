// Blue Guardian adapter — official site https://blueguardian.com
//
// Source page: homepage (/), a Next.js app-router page whose React Server
// Components payload embeds plan structures and evaluation rule matrices:
//   { plan: "two_step_standard", amount: 50000, currentPrice: 174, originalPrice: 232,
//     challengeRules: [...], fundedRules: [...], coupon: { code: "BG25" } }
import { assembleNextPayload, findEnclosingObject, parseMoney, parsePct } from '../lib/shared.mjs';

export default {
  slug: 'blue-guardian',
  name: 'Blue Guardian',
  baseUrl: 'https://blueguardian.com',
  pages: [{ key: 'home', path: '/' }],

  parse(pages) {
    const payload = assembleNextPayload(pages.home);
    if (!payload.includes('"currentPrice"') || !payload.includes('"originalPrice"')) {
      throw new Error('Blue Guardian plan payload not found');
    }

    const plans = [];
    let anchor = payload.indexOf('"currentPrice"');
    while (anchor >= 0) {
      const plan = findEnclosingObject(
        payload,
        anchor,
        (o) => o.amount && o.currentPrice !== undefined && o.plan,
        30_000
      );
      if (plan) {
        const key = `${plan.plan}-${plan.amount}-${plan.accountType || ''}`;
        if (!plans.some((p) => `${p.plan}-${p.amount}-${p.accountType || ''}` === key)) {
          plans.push(plan);
        }
      }
      anchor = payload.indexOf('"currentPrice"', anchor + 1);
    }

    if (!plans.length) throw new Error('no Blue Guardian plans parsed');

    const challenges = [];
    const offers = [];

    for (const plan of plans) {
      // Focus on two-step and one-step standard evaluations
      const steps = plan.plan.includes('one_step') ? 1 : plan.plan.includes('two_step') ? 2 : null;
      if (!steps) continue;

      const accountSize = Number(plan.amount);
      const original = parseMoney(plan.originalPrice);
      const current = parseMoney(plan.currentPrice);
      if (!accountSize || (original == null && current == null)) continue;

      const entry = { accountSize, steps };
      if (original != null && current != null && current < original) {
        entry.price = original;
        entry.discountedPrice = current;
      } else {
        entry.price = current || original;
      }

      // Collect offer if coupon code is present
      if (plan.coupon?.code) {
        const code = String(plan.coupon.code).trim();
        if (!offers.some((o) => o.code === code)) {
          const discountMatch = String(plan.coupon.label || '').match(/(\d+)%/);
          const percentOff = discountMatch ? Number(discountMatch[1]) : 25;
          offers.push({
            code,
            title: plan.coupon.label || `Save ${percentOff}% with code ${code}`,
            percentOff,
          });
        }
      }

      // Extract rules if present
      const rules = plan.challengeRules || [];
      const ptRule = rules.find((r) => /profit target/i.test(r.label || ''));
      if (ptRule?.valuePercent) {
        const target = parsePct(ptRule.valuePercent);
        if (target) entry.profitTargets = steps === 2 ? [target, 5] : [target];
      }

      const dlRule = rules.find((r) => /daily loss/i.test(r.label || ''));
      if (dlRule?.valuePercent) {
        const dl = parsePct(dlRule.valuePercent);
        if (dl) entry.dailyLossPct = dl;
      }

      const ddRule = rules.find((r) => /drawdown/i.test(r.label || ''));
      if (ddRule?.valuePercent) {
        const dd = parsePct(ddRule.valuePercent);
        if (dd) entry.maxLossPct = dd;
      }

      challenges.push(entry);
    }

    if (!challenges.length) throw new Error('no tracked Blue Guardian evaluations found');

    return { firm: {}, challenges, offers };
  },
};
