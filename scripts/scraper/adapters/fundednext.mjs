// FundedNext adapter — official site https://fundednext.com
//
// Source page: /pricing/ — a Next.js app-router page whose React Server
// Components payload (self.__next_f.push chunks) embeds full plan objects:
//   { planName: "Stellar 2-Step $100K", numericAccountSize: 100000,
//     discountedPrice: "$$549.99", details: { challengeRules: [...] } }
// We reassemble the payload, then extract every plan object and keep the
// Stellar 1-Step / 2-Step evaluations (the products this site tracks).
import { assembleNextPayload, findEnclosingObject, parseMoney } from '../lib/shared.mjs';

const TRACKED = /^Stellar (1|2)-Step/;

export default {
  slug: 'fundednext',
  name: 'FundedNext',
  baseUrl: 'https://fundednext.com',
  pages: [{ key: 'pricing', path: '/pricing/' }],

  parse(pages) {
    const payload = assembleNextPayload(pages.pricing);
    if (!payload.includes('"numericAccountSize"')) {
      throw new Error('FundedNext plan payload not found');
    }

    const plans = [];
    let anchor = payload.indexOf('"numericAccountSize"');
    while (anchor >= 0) {
      const plan = findEnclosingObject(
        payload,
        anchor,
        (o) => o.planName && o.numericAccountSize && o.details?.challengeRules,
        80_000
      );
      if (plan && !plans.some((p) => p.planName === plan.planName)) plans.push(plan);
      anchor = payload.indexOf('"numericAccountSize"', anchor + 1);
    }
    if (!plans.length) throw new Error('no FundedNext plans parsed');

    const challenges = [];
    for (const plan of plans) {
      const m = plan.planName.match(TRACKED);
      if (!m) continue;
      const steps = Number(m[1]);
      const accountSize = plan.numericAccountSize;
      const rules = Object.fromEntries((plan.details.challengeRules || []).map((r) => [r.id, r]));

      const entry = { accountSize, steps };
      const displayed = parseMoney(plan.discountedPrice);
      const original = parseMoney(plan.originalPrice);
      if (original != null && displayed != null) {
        entry.price = original;
        entry.discountedPrice = displayed;
      } else if (displayed != null) {
        entry.price = displayed;
      }

      const p1 = rules.p1?.value;
      const p2 = rules.p2?.value;
      const targets = steps === 2 ? [p1, p2] : [p1];
      if (targets.every((v) => typeof v === 'number' && v > 0)) {
        entry.profitTargets = targets.map((v) => Math.round((v / accountSize) * 10000) / 100);
      }
      if (typeof rules.dailyDD?.value === 'number') {
        entry.dailyLossPct = Math.round((rules.dailyDD.value / accountSize) * 10000) / 100;
      }
      if (typeof rules.maxDD?.value === 'number') {
        entry.maxLossPct = Math.round((rules.maxDD.value / accountSize) * 10000) / 100;
      }
      const dd = String(rules.ddType?.value || '').toLowerCase();
      if (dd === 'static') entry.drawdownType = 'static';
      else if (dd.includes('trail')) entry.drawdownType = 'eod-trailing';
      challenges.push(entry);
    }
    if (!challenges.length) throw new Error('no tracked Stellar plans found');

    return { firm: {}, challenges, offers: [] };
  },
};
