// Fxify adapter — official site https://fxify.com
//
// Source page: /programs/two-phase/ — the Two Phase program page embeds a
// JSON array of plan cards:
//   { title: "$25k", price: "$199", rows: [
//       { title: "Profit Target", values: [{ value: "$2,500 | 10%" }, ...] },
//       { title: "Daily Loss Limit", values: [{ value: "3%" }, { value: "3%" }] },
//       { title: "Max Trailing Drawdown", values: [{ value: "6%" }, ...] } ] }
// NOTE: fxify.com publishes no explicit profit-split / payout-cycle figures
// on this page, so those fields are never touched. This adapter only updates
// challenge rows that already exist in challenges.json.
import { findEnclosingArray, parseMoney, parsePct, parseSize } from '../lib/shared.mjs';

export default {
  slug: 'fxify',
  name: 'Fxify',
  baseUrl: 'https://fxify.com',
  pages: [{ key: 'twoPhase', path: '/programs/two-phase/' }],

  parse(pages) {
    const html = pages.twoPhase;
    const anchor = html.indexOf('"title":"$5k"');
    if (anchor < 0) throw new Error('Fxify plan cards not found');
    const plans = findEnclosingArray(
      html,
      anchor,
      (arr) => arr.length >= 3 && arr.every((p) => p?.title && p?.rows),
      60_000
    );
    if (!plans) throw new Error('could not parse Fxify plan array');

    const rowValue = (plan, label, idx = 0) =>
      plan.rows.find((r) => r.title === label)?.values?.[idx]?.value;

    const challenges = [];
    for (const plan of plans) {
      const accountSize = parseSize(plan.title);
      const price = parseMoney(plan.price);
      if (!accountSize || price == null) continue;

      const entry = { accountSize, steps: 2, price };
      const target = parsePct(rowValue(plan, 'Profit Target'));
      if (target != null) entry.profitTargets = [target, target];
      const daily = parsePct(rowValue(plan, 'Daily Loss Limit'));
      if (daily != null) entry.dailyLossPct = daily;
      const maxDD = parsePct(rowValue(plan, 'Max Trailing Drawdown'));
      if (maxDD != null) {
        entry.maxLossPct = maxDD;
        entry.drawdownType = 'eod-trailing';
      }
      challenges.push(entry);
    }
    if (!challenges.length) throw new Error('no Fxify plans parsed');

    return { firm: {}, challenges, offers: [] };
  },
};
