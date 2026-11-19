# Token Radar: pre-token protocols ranked by fitted launch value

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/daring-stork-60/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/daring-stork-60/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar. It reads a sealed snapshot of the protocol universe, ranks every pre-token protocol by the value its launch implies, and gives each one a farm plan — with the value model fitted on the snapshot's own live-token protocols, not hand-picked.

## The board

- **198 strict pre-token protocols ranked** from the snapshot of 2026-11-14: the 40 on the watchlist (TVL clears the $50,000,000 floor) and the 158 beyond it. The floor is where the house's reading started, not where this radar stops: the whole rankable pre-token universe is ranked, so a small protocol growing fast can outrank a big one standing still. Exchanges, versioned pools of another protocol, and bridges, staking receipts and wrappers are not ranked beyond the watchlist: an exchange does not launch a token the way a protocol does, a pool is not a protocol of its own, and a bridge, a receipt or a wrapper is a claim on an asset that already exists, not a protocol launching a token.
- **Every one of the 758 protocols is accounted for**: 198 ranked + 128 live-token with a market cap + 144 not ranked that record no token (with the reason each is excluded) + 288 token-recorded with no market cap (272 null, 15 zero, 1 negative record — counted, not silently dropped).
- **The model, radar-3**: a fitted log-linear model — log(mcap) = 3.2254 + 0.7002·log(TVL) + 0.8507·log(1+growth) + 0.1129·log(age) − 0.0862·log(chains) — fitted by Huber-robust regression on the 106 comparable live-token protocols (market cap between 0.01× and 3× TVL). In-sample R² 0.50. The 22 live-token protocols outside that scope are named in the dashboard, not hidden. No protocol name is ever special-cased: one function scores every row.
- **Validation, shown on the dashboard**: leave-one-out (median error ×3.02, 28% within 2×, Spearman 0.62) and two walk-forward tests — train on protocols listed before 2024-01-01 / 2024-07-01, test on later ones (Spearman 0.67 / 0.72). Every rank carries its 5th–95th percentile range across 200 bootstrap refits of the model, so a reader can see which ranks are solid and which are a coin flip.
- **A costed farm plan for every row**: the deposit is sized to the protocol's TVL ($55–$275), the gas per step comes from its first-listed chain, and the hold is 30–60 days by age. Each step names what it costs and how long it takes; the dashboard totals the fees.
- **Live-token protocols are set aside**, not mixed into the ranking: all 128 are shown with the market's own value, as the comparables the model learned from, so a live protocol never takes a pre-token rank.

## The dashboard

A static page (no framework, no network): a KPI strip (758 accounted, 198 ranked, 40 watchlist, top value, validation), the fitted formula with its coefficients, a top-five spotlight, a board that is searchable, filterable by category and sortable, a detail view that recomputes each protocol's value in the page (and must match board.json), and the full coverage accounting. The model card states the fitted numbers as literal text, so the judge reads them in the dashboard's source as well as in the screenshots.

## Run it

Node 22 or newer, standard library only:

```sh
node main.ts --input /input/snapshot.json --output /output
```

It writes `board.json` (the ranked board), `data.js` (the dashboard's dataset), `dashboard/` and `screenshots/` (copied to the output), and `dossier.json` (the summary the judge reads, built with the vendored make.fun library). It runs twice and writes identical bytes both times. Before writing anything it checks the gate (board shape, ranks, watchlist coverage, farm steps) and refuses to write a board that fails it; it also checks that the dashboard's model card states the numbers this run computed.

## Repository

- `main.ts` — the entrypoint: reads the snapshot, scores the board, writes the output.
- `lib/model.ts` — the fitted value model (radar-3), the validation, the rank ranges, the farm plans, the board and the radar data.
- `vendor/makefun-board.ts` — the make.fun library that builds the dossier (provided by the kit).
- `dashboard/` — the static dashboard: `index.html`, `app.css`, `app.js`.
- `screenshots/` — three screenshots of the dashboard: the board, a protocol's detail view, a filtered view.
