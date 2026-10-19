// The5ers adapter — official site https://the5ers.com
//
// Source page: /high-stakes/ — a Next.js page whose RSC payload contains a
// "funding_plan_list" array; one tab per account size ($2.5K ... $100K),
// each with table rows for Maximum Daily Loss, Maximum Loss, Profit Target
// and Cost. Currency tokens appear as "$$35" (symbol placeholder) — stripped.
import { assembleNextPayload, extractBalanced, parseMoney, parsePct, parseSize } from '../lib/shared.mjs';

export default {
  slug: 'the5ers',
  name: 'The5ers',
  baseUrl: 'https://the5ers.com',
  pages: [{ key: 'highStakes', path: '/high-stakes/' }],

  parse(pages) {
    const payload = assembleNextPayload(pages.highStakes);
    const anchor = payload.indexOf('"funding_plan_list":[');
    if (anchor < 0) throw new Error('funding_plan_list not found on the5ers.com');
    const list = JSON.parse(extractBalanced(payload, payload.indexOf('[', anchor)));
    if (!Array.isArray(list) || !list.length) throw new Error('empty funding_plan_list');

    const rowOf = (tab, label) => (tab.table_content || []).find((r) => r.row_label === label);
    const cell = (row, idx = 0, preferNew = true) => {
      const v = row?.row_values?.[idx];
      if (!v) return '';
      return preferNew && v.value_new ? v.value_new : v.val_text || v.value_new || '';
    };

    const challenges = [];
    for (const tab of list) {
      const accountSize = parseSize(String(tab.tab_title || '').replace(/\$/g, ''));
      if (!accountSize) continue;

      const entry = { accountSize, steps: 2 };
      const cost = parseMoney(cell(rowOf(tab, 'Cost')));
      if (cost != null) entry.price = cost;

      const daily = parsePct(cell(rowOf(tab, 'Maximum Daily Loss'), 0, false));
      if (daily != null) entry.dailyLossPct = daily;
      const maxLoss = parsePct(cell(rowOf(tab, 'Maximum Loss'), 0, false));
      if (maxLoss != null) entry.maxLossPct = maxLoss;

      const targetRow = rowOf(tab, 'Profit Target');
      const p1 = parsePct(cell(targetRow, 0)); // prefers value_new (current figure)
      const p2 = parsePct(cell(targetRow, 1, false));
      if (p1 != null && p2 != null) entry.profitTargets = [p1, p2];

      // "80%-100%" -> base split is the lower bound.
      const split = String(cell(rowOf(tab, 'Profit Share'), 2, false)).match(/(\d+(?:\.\d+)?)/);
      if (split) entry.profitSplitPct = Number(split[1]);

      challenges.push(entry);
    }
    if (!challenges.length) throw new Error('no The5ers High Stakes tabs parsed');

    return { firm: {}, challenges, offers: [] };
  },
};
