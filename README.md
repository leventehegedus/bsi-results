# BSI Results Explorer

React app for browsing BSI race results (SPAR Budapest Maraton, Wizz Air Félmaraton, Vivicittá, …)
from the unofficial JSON API behind [results.futanet.hu](https://results.futanet.hu), and for
collecting every finisher from a given town across many races.

**Stack:** Vite · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui (new-york, neutral) on Radix ·
Redux Toolkit · axios · oxlint · Vercel

The UI is in Hungarian and English (switch in the header; the choice is saved, otherwise the
browser language decides).

## Features

- **Race browser**: ~2 800 result lists since 1984, grouped by year (the current year opens by
  default) and into events (e.g. the whole SPAR Budapest Maraton weekend), expandable to their
  sub-events. Search by name, open results, filter by name, town (or click a town), club, bib,
  category, gender, country, net time, birth year and place, paginate, export to CSV.
  Includes 542 older races (1984–2019) that the API has but doesn't list (`src/api/legacyRaces.json`).
- **Town search**: give one or more towns (`Budapest, Szeged`) and pick distances (marathon, half
  marathon, 10 km, 5 km, other). Race distances are read once and cached in localStorage; the
  matching lists are scanned with the `town` filter (cancellable) and shown as:
  - every finish, with sub-lists of the same event (amateur cup, profession championships)
    merged into one run, and virtual races optionally excluded;
  - or one row per runner with their best time and number of finishes.
  - CSV export (semicolon + UTF-8 BOM, opens cleanly in Hungarian Excel).

- **Runner profile**: click any runner's name (Race browser or Town search) to see all of their
  results across every race, or search by part of a name (≥ 3 characters) + optional birth year
  in the **Runner** tab. Partial searches show a Name and Born column when several people match;
  birth years and towns are buttons that filter the table, names open that person's profile:
  - the birth year is worked out from the clicked result row (the API doesn't return it, but can
    filter by it, so the app binary-searches `minYob`/`maxYob` on that row: ~8 requests);
  - every race (~2 250, incl. unlisted Budapest Marathon editions) is then scanned with
    `name` + birth year, so people sharing a name are kept apart (~30 s, streamed, cancellable);
  - the API's name filter is an accent-insensitive substring match, so only exact name matches
    are kept (case/accents/“dr.” ignored, “ifj.” kept apart);
  - personal bests per distance, stats, CSV export, and a shareable link
    (`#runner=<name>&yob=<year>`).

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run lint
npm run typecheck
npm run build
```

### Why requests go through `/api/futanet`

`results.futanet.hu` sends no CORS headers, so the browser can't call it directly. The app
always calls its own origin:

| Environment | Proxy |
|---|---|
| `npm run dev` | Vite `server.proxy` → `https://results.futanet.hu/api` (`vite.config.ts`) |
| Vercel | `rewrites` in `vercel.json` |

## API notes (unofficial, may change)

Base: `https://results.futanet.hu/api`

| Endpoint | Method | Notes |
|---|---|---|
| `/raceList/` | GET | `{ current, past }` → `{ id, name, date }` |
| `/race/{code}` | GET | metadata: `nev`, `datum`, `tav` (m), `meret` (finishers), `statusz` |
| `/resultList/{code}?page=N` | **POST** | multipart filters: `name`, `town`, `club`, `bib`, `category`, `country`, `sex`, `minYob`/`maxYob`, `minPlace`/`maxPlace`, `minNetTime`/`maxNetTime`. 40 rows/page. Empty lists return HTML. |
| `/fields/{code}` | GET | visible columns + HU/EN headers |
| `/raceCategory/{code}` | GET | category list |

Result rows have no birth year field, but `minYob`/`maxYob` filter on it for every race back to
1984. `name` matches accent-insensitively as a substring.

The `town` filter is an exact match. Town data exists from 1996; 1984–1993 lists only have
name/club/country. Races from before 2020 that are not in `/raceList/` are listed in
`src/api/legacyRaces.ts` (no Budapest Marathon code found for 2009).

## Project layout

```
src/
  api/            axios client, typed endpoints, legacy race codes
  components/ui/  shadcn/ui components (Radix primitives)
  i18n/           UI texts: en.ts (the shape), hu.ts, useT() hook; language in the ui slice
  features/
    races/        race list slice + browser
    results/      single-race results slice + panel
    townScan/     multi-race town scan slice (thunk with progress/cancel) + UI
    runner/       runner profile: birth-year lookup, all-race scan, PBs, RunnerLink
    ui/           active tab
  lib/            CSV, concurrency pool, result normalisation/dedup
  store/          Redux store, typed hooks
```

## Deployment (GitHub Actions → Vercel)

`.github/workflows/ci.yml` runs lint, typecheck and build on every PR and push, then deploys with
the Vercel CLI: **preview** for PRs (URL posted as a PR comment), **production** on `main`.
Vercel's own Git auto-deploys are disabled in `vercel.json` so only CI deploys.

One-time setup:

1. Create the project and link it locally: `npx vercel link` (creates `.vercel/project.json`).
2. Create a token at <https://vercel.com/account/tokens>.
3. Add repository secrets (Settings → Secrets and variables → Actions):
   - `VERCEL_TOKEN`: the token
   - `VERCEL_ORG_ID`: `orgId` from `.vercel/project.json`
   - `VERCEL_PROJECT_ID`: `projectId` from `.vercel/project.json`
