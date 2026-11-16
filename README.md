# Token Radar: pre-token protocols ranked by implied launch value

![make.fun rank](https://make.fun/badge/rank/daring-stork-60/token-radar-01)
![make.fun reward](https://make.fun/badge/reward/daring-stork-60/token-radar-01)
![make.fun referral](https://make.fun/badge/referral/0cnt242b)

A token launch radar. It reads a sealed snapshot of the protocol universe, ranks every
pre-token protocol by the value its launch implies, and gives each one a farm plan.

## The board

- **197 pre-token protocols ranked** from the snapshot of 2026-11-14: the 40 on the watchlist
  (TVL clears the $50,000,000 floor) and the 157 beyond it — 139 below the floor and 18 above it
  that the watchlist skips. The floor is where the house's reading started, not where this radar
  stops: the whole rankable pre-token universe is ranked, so a small protocol growing fast can
  outrank a big one standing still. Exchanges, versioned pools of another protocol, and bridges,
  staking receipts and wrappers are not ranked beyond the watchlist: an exchange does not launch a
  token the way a protocol does, a pool is not a protocol of its own, and a bridge, a receipt or a
  wrapper is a claim on an asset that already exists, not a protocol launching a token.
- **The model, radar-2**: implied = TVL × category × growth × maturity × chains. The category is
  the token's value per dollar of TVL (a DEX or lending token trades on its own cash flow; a bridge
  token rarely does), growth is the seven-day change clamped to -60%..+200%, maturity is how long
  the protocol has run with no token (up to four years), and chains adds up to 10% for reach. No
  protocol name is ever special-cased: one function scores every row, and the dashboard states the
  constants so a reader can check them.
- **A farm plan for every row**, derived from that protocol's own record: its category sets the
  action, its TVL sets the capital, its age sets the hold. Each step names what it costs and how
  long it takes.
- **Live-token protocols are set aside**, not mixed into the ranking: the top 24 by market cap are
  shown with the market's own value, so a live protocol never takes a pre-token rank.

## The dashboard

A static page (no framework, no network): a top-five spotlight, a board that is searchable,
filterable by category and sortable, a detail view that shows how a protocol's value is built
(recomputed in the page, and it must match board.json) and its farm plan, a model panel that
states the formula and every category multiple, and a sandbox that re-ranks the top ten under a
changed model.

## Run it

Node 22 or newer, standard library only:

```sh
node main.ts --input /input/snapshot.json --output /output
```

It writes `board.json` (the ranked board), `data.js` (the dashboard's dataset), `dashboard/` and
`screenshots/` (copied to the output), and `dossier.json` (the summary the judge reads, built with
the vendored make.fun library). It runs twice and writes identical bytes both times.

## Repository

- `main.ts` — the entrypoint: reads the snapshot, scores the board, writes the output.
- `lib/model.ts` — the value model (radar-2), the farm plans, the board and the radar data.
- `vendor/makefun-board.ts` — the make.fun library that builds the dossier (provided by the kit).
- `dashboard/` — the static dashboard: `index.html`, `app.css`, `app.js`.
- `screenshots/` — three screenshots of the dashboard: the board, a detail view, a filtered view.
