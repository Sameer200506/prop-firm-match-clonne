# prop firm match clonne (Astro prop-trading-firm comparison site)

A static, zero-backend clone of a prop-trading-firm comparison platform, built
with **Astro + TypeScript + Content Collections**. All firm numbers live in
JSON — templates never hardcode figures.

## Run (PowerShell)

From the project folder (`"c:\Users\moham\Desktop\prop firm match clonne"` —
quote paths, they contain a space):

```powershell
# install dependencies (once)
npm install

# dev server with hot reload (http://localhost:4321)
npm run dev

# production build + local preview (use ';' — not '&&' — in PowerShell)
npm run build; npm run preview
```

Stop the dev/preview server with `Ctrl+C`.

## Pages

| Route         | What it is                                             |
| ------------- | ------------------------------------------------------ |
| `/`           | Hero, live stat bar, offers strip, ranked firm grid    |
| `/prop-firms/`| Filterable directory table (vertical, account size, profit split, steps, discount, search) |
| `/prop-firms/[slug]/` | Firm profile: Overview / Challenges / Reviews / Offers tabs |
| `/prop-firm-challenges` | Every tracked challenge in one filterable, price-sortable table |
| `/compare-firms/` | Head-to-head picker (two selects + featured matchups) |
| `/compare-firms/[a-vs-b]/` | Generated pair pages for all firms with challenge data (~91) |
| `/match`      | 6-question quiz with a weighted scoring engine and top-5 results |
| `/offers`     | All active promo codes with copy buttons and example savings |
| `/futures`    | Futures vertical listing + explainers                  |
| `/robots.txt` | Dynamic route emitting the sitemap URL from `Astro.site` |

Directory filters run as inline vanilla JS over the server-rendered rows — no
client framework. The header's Forex/Futures tabs deep-link via
`?vertical=...`; the Crypto tab uses `?vertical=crypto`, an assets-based
filter matching any firm offering crypto.

## Editing the dataset

Everything is Zod-validated at build time (`npm run build` fails loudly on
invalid data):

| File / folder                  | Collection   | Notes                                          |
| ------------------------------ | ------------ | ---------------------------------------------- |
| `src/content/firms/*.json`     | `firms`      | One file per firm; the **file name is the id/slug** |
| `src/content/challenges.json`  | `challenges` | Array; each entry needs a unique `id` + `firm` slug |
| `src/content/offers.json`      | `offers`     | Array of discount offers                       |
| `src/content/reviews.json`     | `reviews`    | Array of trader reviews                        |

Schema definitions: `src/content.config.ts`.

Tips:

- To add a firm, create `src/content/firms/<slug>.json` and set `"slug"` to
  the same value as the file name. Set `"estimated": true` when figures are
  approximations.
- Challenge entries reference firms via `"firm": "<slug>"`.
- Discounts appear automatically as badges when a firm has a `discount`
  object and/or an entry exists in `offers.json`.
- `lastUpdated` uses ISO dates, e.g. `2026-08-24`.

## Data scraper (`npm run scrape`)

`scripts/scraper/` keeps the dataset fresh by pulling each firm's **official**
website (never propfirmmatch.com) and merging challenge fees, profit targets,
daily/max loss limits, profit splits and promo codes into the JSON content.

```powershell
npm run scrape                       # fetch live data, write only changed files
npm run scrape -- --dry-run          # report what WOULD change, write nothing
npm run scrape -- --firm=ftmo        # limit to specific slug(s), repeatable
```

Design notes:

- **Adapters** — one module per firm in `scripts/scraper/adapters/` (FTMO,
  FundedNext, Topstep, The5ers, Fxify, E8 Markets, FundingPips). Firms without
  an adapter are logged as `no-adapter` and skipped; data is never invented.
- **Politeness** — one request at a time, ≥2 s per-domain delay plus jitter
  (override with `SCRAPE_DELAY_MS`), and each domain's `robots.txt` is checked
  before crawling.
- **Bot protection** — Cloudflare/WAF blocks (403/429/503) trigger at most one
  back-off retry, then the firm is marked `scrape.status: "blocked"` and its
  existing data is left untouched.
- **Change detection** — scraped values are deep-compared against the current
  JSON; a file is rewritten only when something actually changed, so two
  consecutive runs write nothing.
- **Schema safety** — every update is validated against a Zod mirror of
  `src/content.config.ts` before writing; invalid updates are logged and skipped.
- **Logging** — each request appends a JSON line to
  `scripts/scraper/logs/scrape.log` (gitignored), and a per-firm summary table
  (`updated / unchanged / blocked / failed / no-adapter`) is printed at the end.

After a successful scrape, run `npm run build` to re-validate and regenerate
the site.

### Scheduling automatic runs

**Manual:** just run `npm run scrape` whenever you want a refresh.

**Windows Task Scheduler (daily at 06:00).** The repo ships a tiny wrapper,
`scripts/scraper/run-scrape.bat`, which handles the folder's space and calls
npm correctly. Register it from an **elevated CMD or PowerShell** prompt — the
`\"...\"` quoting is the documented way to pass a spaced path to `/tr`:

```bat
schtasks /create /tn "PropFirmScrape" /tr "\"c:\Users\moham\Desktop\prop firm match clonne\scripts\scraper\run-scrape.bat\"" /sc daily /st 06:00
```

If you prefer a one-liner without the wrapper, wrap the command in `cmd /c` so
the `&&` is interpreted by `cmd` (run this in **CMD.exe**, not PowerShell):

```bat
schtasks /create /tn "PropFirmScrape" /tr "cmd /c cd /d \"c:\Users\moham\Desktop\prop firm match clonne\" && npm run scrape" /sc daily /st 06:00
```

The `&&` lives inside the quoted `/tr` value, so the calling shell never
executes it — only `cmd /c` does when the task fires.

**Linux / macOS (cron), daily at 06:00:**

```cron
0 6 * * * cd /path/to/prop-firm-match-clonne && npm run scrape >> scripts/scraper/logs/cron.log 2>&1
```

## Project structure

```
scripts/
  scraper/      `npm run scrape` orchestrator, lib/ helpers, per-firm adapters/
src/
  components/   Header, Footer, FirmCard, StarRating, DiscountBadge,
                ChallengeTable, FilterBar, StatBar
  content/      JSON dataset (firms/, challenges, offers, reviews)
  layouts/      BaseLayout.astro
  pages/        index, prop-firms/ (+[slug]), prop-firm-challenges,
                compare-firms/ (+[slug]), match, offers, futures,
                robots.txt.ts
  styles/       global.css (design system)
  utils/        format.ts (money/years helpers)
```

> Demo project. Branding, copy and design are original; no material was copied
> from propfirmmatch.com. Not financial advice.
