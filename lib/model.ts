// Token Radar — radar-3: a fitted launch-value model.
//
// The model is fitted, not hand-picked. It regresses the log market cap of
// live-token protocols on their own snapshot figures (log TVL, seven-day
// growth, age with no token, chain count), using the protocols in this very
// snapshot as the training set, and it is validated with leave-one-out and
// walk-forward tests plus 200 bootstrap refits that give every protocol a
// rank range. Nothing here names a protocol: one function scores every row.
//
// Run deterministically: a fixed seed drives the refits, the snapshot is
// sealed, and no clock or random source enters the output.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  // Extra keys the gate allows, so the dashboard can show them.
  category: string | null;
  tvl_usd: number;
  change_7d: number | null;
  age_days: number;
  chains: number;
  primary_chain: string;
  rank_lo: number;
  rank_hi: number;
  deposit_usd: number;
  plan_fees_usd: number;
  hold_days: number;
  watchlist: boolean;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
  in_fit: boolean;
  out_of_scope: string | null;
}

export interface ExcludedRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

export interface Validation {
  loo: { n: number; med_abs_log_err: number; med_factor: number; within_2x: number; spearman: number };
  walk_forward: Array<{
    cutoff: string;
    train_n: number;
    test_n: number;
    r2: number;
    med_abs_log_err: number;
    med_factor: number;
    within_2x: number;
    spearman: number;
  }>;
  in_sample_r2: number;
  refits: number;
}

export interface ModelMeta {
  name: string;
  formula: string;
  coefficients: { intercept: number; log_tvl: number; growth: number; log_age: number; log_chains: number };
  train_n: number;
  comparable_n: number;
  live_n: number;
  scope_min_ratio: number;
  scope_max_ratio: number;
  out_of_scope: string[];
  age_default_days: number;
  growth_clamp: [number, number];
}

export interface Coverage {
  total: number;
  board: number;
  watchlist: number;
  watchlist_on_board: number;
  live_with_mcap: number;
  live_in_fit: number;
  live_out_of_scope: number;
  token_no_mcap: number;
  token_mcap_zero: number;
  token_mcap_bad: number;
  excluded_no_token: Record<string, number>;
}

export interface RadarData {
  meta: { as_of: string; source: string; floor_usd: number; model: string; snapshot_protocols: number };
  model: ModelMeta;
  validation: Validation;
  coverage: Coverage;
  rows: BoardRow[];
  live: LiveRow[];
  excluded: ExcludedRow[];
  gas_table: Record<string, number>;
}

// ---------------------------------------------------------------- snapshot

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (typeof raw.as_of !== 'string' || typeof raw.source !== 'string') {
    throw new Error('snapshot: as_of/source missing');
  }
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: protocols/watchlist missing');
  }
  const protocols = raw.protocols.map((p) => {
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number') {
      throw new Error('snapshot: bad protocol record');
    }
    return {
      slug: p.slug,
      name: p.name,
      category: p.category ?? null,
      chains: Array.isArray(p.chains) ? p.chains.map(String) : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    } satisfies SnapshotProtocol;
  });
  protocols.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return { as_of: raw.as_of, source: raw.source, floor_usd: raw.floor_usd, protocols, watchlist: [...raw.watchlist].sort() };
}

// ------------------------------------------------------------- classification

export function recordsNoToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Why a protocol that records no token is still not a launch candidate. Null when it is one. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return 'category: ' + p.category;
  if (VERSION_SUFFIX.test(p.name)) return 'versioned name';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped / staked word in name';
  if (EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) return 'exchange name';
  return null;
}

export function isStrictPreToken(p: SnapshotProtocol): boolean {
  return recordsNoToken(p) && exclusionReason(p) === null;
}

// ------------------------------------------------------------------ features

export const AGE_DEFAULT_DAYS = 730;
export const GROWTH_CLAMP: [number, number] = [-60, 200];

export function ageDays(p: SnapshotProtocol, asOfMs: number): number {
  if (p.listed_at === null) return AGE_DEFAULT_DAYS;
  const days = Math.round((asOfMs - Date.parse(p.listed_at)) / 86400000);
  return Math.max(1, days);
}

export function clampedGrowth(p: SnapshotProtocol): number {
  if (p.change_7d === null) return 0;
  return Math.min(GROWTH_CLAMP[1], Math.max(GROWTH_CLAMP[0], p.change_7d));
}

/** The model's five regressors: intercept, log TVL, log(1 + growth), log age, log chain count. */
export function features(p: SnapshotProtocol, asOfMs: number): number[] {
  return [
    1,
    Math.log(Math.max(1, p.tvl_usd)),
    Math.log(1 + clampedGrowth(p) / 100),
    Math.log(ageDays(p, asOfMs)),
    Math.log(Math.max(1, p.chains.length)),
  ];
}

// ------------------------------------------------------------ linear algebra

function solveLinear(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const m = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    const tmp = m[col];
    m[col] = m[pivot];
    m[pivot] = tmp;
    const d = m[col][col];
    if (Math.abs(d) < 1e-12) throw new Error('singular design matrix');
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / d;
      for (let k = col; k <= n; k++) m[r][k] -= f * m[col][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

function weightedLeastSquares(design: number[][], y: number[], weights: number[], penalties: number[]): number[] {
  const k = design[0].length;
  const xtx: number[][] = Array.from({ length: k }, () => Array<number>(k).fill(0));
  const xty: number[] = Array<number>(k).fill(0);
  for (let i = 0; i < design.length; i++) {
    const x = design[i];
    const w = weights[i];
    for (let a = 0; a < k; a++) {
      xty[a] += w * x[a] * y[i];
      for (let b = 0; b < k; b++) xtx[a][b] += w * x[a] * x[b];
    }
  }
  for (let a = 0; a < k; a++) xtx[a][a] += penalties[a];
  return solveLinear(xtx, xty);
}

/**
 * Huber-robust fit (iteratively reweighted least squares). Outliers — a token
 * trading 400x its TVL, a dead pool's token — are down-weighted, not deleted:
 * the fit stays honest about the bulk of the market.
 */
export function huberFit(design: number[][], y: number[], penalties: number[], iterations = 15): number[] {
  let weights = design.map(() => 1);
  let beta: number[] = [];
  for (let it = 0; it < iterations; it++) {
    beta = weightedLeastSquares(design, y, weights, penalties);
    const residuals = design.map((x, i) => y[i] - dot(beta, x));
    const mad = median(residuals.map(Math.abs)) || 1;
    const c = 1.345 * 1.4826 * mad;
    weights = residuals.map((e) => (Math.abs(e) <= c ? 1 : c / Math.abs(e)));
  }
  return beta;
}

export function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function quantileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
  return sorted[idx];
}

export function spearman(xs: number[], ys: number[]): number {
  const rankOf = (values: number[]): number[] => {
    const order = values.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
    const ranks = new Array<number>(values.length);
    let i = 0;
    while (i < order.length) {
      let j = i;
      while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) ranks[order[k][1]] = avg;
      i = j + 1;
    }
    return ranks;
  };
  const rx = rankOf(xs);
  const ry = rankOf(ys);
  const n = xs.length;
  const mx = rx.reduce((s, v) => s + v, 0) / n;
  const my = ry.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    cov += (rx[i] - mx) * (ry[i] - my);
    vx += (rx[i] - mx) ** 2;
    vy += (ry[i] - my) ** 2;
  }
  return vx === 0 || vy === 0 ? 0 : cov / Math.sqrt(vx * vy);
}

function regressionMetrics(actual: number[], predicted: number[]): { r2: number; med_abs_log_err: number; within_2x: number; spearman: number } {
  const mean = actual.reduce((s, v) => s + v, 0) / actual.length;
  let ssRes = 0;
  let ssTot = 0;
  const absErr: number[] = [];
  for (let i = 0; i < actual.length; i++) {
    const e = actual[i] - predicted[i];
    ssRes += e * e;
    ssTot += (actual[i] - mean) ** 2;
    absErr.push(Math.abs(e));
  }
  const med = median(absErr);
  return {
    r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot,
    med_abs_log_err: med,
    within_2x: absErr.filter((e) => e <= Math.log(2)).length / absErr.length,
    spearman: spearman(predicted, actual),
  };
}

// ------------------------------------------------------------------ refits

/** Deterministic PRNG: the same seed gives the same 200 refits on every run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --------------------------------------------------------------- farm plans

export const GAS_TABLE: Record<string, number> = {
  Ethereum: 4.0,
  Bitcoin: 1.0,
  Tron: 0.5,
  Avalanche: 0.3,
  'Binance': 0.15,
  Polygon: 0.05,
  Base: 0.05,
  Arbitrum: 0.1,
  Optimism: 0.08,
  'zkSync Era': 0.1,
  Linea: 0.05,
  Scroll: 0.05,
  Mantle: 0.05,
  Blast: 0.05,
  Mode: 0.05,
  Solana: 0.01,
  Sui: 0.01,
  Aptos: 0.01,
  Sei: 0.01,
  Near: 0.01,
  Stellar: 0.01,
  'Hyperliquid L1': 0.01,
  Gnosis: 0.1,
  Fantom: 0.05,
  Kava: 0.05,
  Ronin: 0.02,
  'World Chain': 0.05,
};
export const GAS_DEFAULT = 0.5;

export function gasForChain(chain: string): number {
  return GAS_TABLE[chain] ?? GAS_DEFAULT;
}

function fmtUsd(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function fmtGas(n: number): string {
  return '$' + n.toFixed(2);
}

/** Deposit sized to the protocol: bigger TVL, bigger sensible stake, $25–$500. */
export function depositFor(tvlUsd: number): number {
  const raw = 100 * Math.pow(Math.max(1, tvlUsd) / 50000000, 0.25);
  return Math.min(500, Math.max(25, Math.round(raw / 5) * 5));
}

/** How long to hold: young protocols need longer farming to register. */
export function holdDaysFor(age: number): number {
  if (age < 180) return 60;
  if (age < 730) return 45;
  return 30;
}

const CATEGORY_ACTIONS: Record<string, [string, string]> = {
  Dexs: ['Swap through the protocol pools', 'Add liquidity to its deepest pool'],
  Lending: ['Supply collateral on the protocol', 'Borrow a small amount against it, then repay'],
  'Risk Curators': ['Deposit into a curator vault', 'Allocate across a second vault and rebalance monthly'],
  'Onchain Capital Allocator': ['Deposit into the allocation vault', 'Review and vote on its allocation proposals'],
  CDP: ['Mint the stablecoin against collateral', 'Keep the collateral ratio above the liquidation line'],
  Yield: ['Deposit into the highest-yield vault', 'Compound the yield every week'],
  'Yield Aggregator': ['Deposit into the aggregator vault', 'Compound the yield every week'],
  RWA: ['Buy tokenised real-world assets', 'Hold through one full yield cycle'],
  Derivatives: ['Open a small hedged position', 'Close and reopen the position monthly'],
  'Basis Trading': ['Deposit into the basis vault', 'Track the funding rate every week'],
  Restaking: ['Restake assets through the protocol', 'Delegate to a second operator after two weeks'],
  'Staking Pool': ['Stake in the pool', 'Restake the rewards weekly'],
  Chain: ['Bridge to the chain and use its core apps', 'Run a transaction on the chain every week'],
  'Liquidity Manager': ['Deposit into a managed liquidity position', 'Rebalance when the range drifts'],
  'Interest Rate Derivatives': ['Buy fixed-rate exposure', 'Roll the position before expiry'],
  'Anchor BTC': ['Hold BTC through the wrapped product', 'Use it once as collateral'],
  'Decentralized BTC': ['Hold BTC through the protocol', 'Use it once as collateral'],
  'Cross Chain Bridge': ['Bridge to the main destination chain', 'Bridge a small amount back every week'],
  'CDP Manager': ['Manage a CDP through the protocol', 'Adjust the collateral ratio monthly'],
  CeDeFi: ['Deposit into the CeDeFi vault', 'Withdraw and redeposit after a month'],
  'OTC Marketplace': ['Place an OTC order', 'Settle a second small order the next week'],
  Insurance: ['Buy cover', 'Keep the cover active through the hold'],
  'Dual-Token Stablecoin': ['Mint the stablecoin', 'Stake the yield token for the hold period'],
  Farm: ['Stake in the farm', 'Harvest and restake every week'],
  Payments: ['Route payments through the protocol', 'Repeat a payment every week'],
  'Governance Incentives': ['Lock tokens to vote on governance', 'Vote on two proposals during the hold'],
  'Crypto Card Issuer': ['Spend through the card', 'Keep the card active every week'],
  'Prediction Market': ['Place prediction positions', 'Resolve and re-enter every week'],
  'Stablecoin Wrapper': ['Wrap assets through the protocol', 'Use the wrapped asset in one DeFi position'],
  Indexes: ['Buy the index token', 'Rebalance at the monthly index update'],
  'Collateral Markets': ['Supply collateral', 'Borrow a small amount and repay'],
  'Leveraged Farming': ['Open a leveraged farm position', 'Deleverage and re-enter monthly'],
  'Uncollateralized Lending': ['Lend through the credit pool', 'Review borrower repayments weekly'],
};

function categoryActions(category: string | null): [string, string] {
  if (category !== null && CATEGORY_ACTIONS[category] !== undefined) return CATEGORY_ACTIONS[category];
  return ['Use the protocol with a real position', 'Repeat the core action every week'];
}

export interface FarmPlan {
  steps: string[];
  deposit_usd: number;
  fees_usd: number;
  tx_count: number;
  hold_days: number;
}

export function farmPlan(p: SnapshotProtocol, asOfMs: number): FarmPlan {
  const chain = p.chains.length > 0 ? p.chains[0] : 'Ethereum';
  const gas = gasForChain(chain);
  const deposit = depositFor(p.tvl_usd);
  const age = ageDays(p, asOfMs);
  const hold = holdDaysFor(age);
  const weeks = Math.max(1, Math.round(hold / 7));
  const [main, second] = categoryActions(p.category);
  const txCount = 3 + weeks;
  const fees = gas * txCount;
  const steps = [
    `Bridge ${fmtUsd(deposit)} to ${chain} and set up a wallet for ${p.name} (gas ~${fmtGas(gas)}, about 10 minutes).`,
    `${main} on ${p.name} with ${fmtUsd(deposit)} on ${chain} (gas ~${fmtGas(gas)}, about 15 minutes).`,
    `${second} on ${p.name} once a week for ${weeks} weeks (gas ~${fmtGas(gas)} each time, about 10 minutes a week).`,
    `Hold the position for ${hold} days and check ${p.name} once a week for points, quests or new pools (about 5 minutes a week, no gas).`,
    `Keep a record: save the wallet address, the transaction hashes and a screenshot of the position, so a future claim can be proved (about 10 minutes, no gas).`,
    `When ${p.name} launches a token, claim or exit through its official claim page and unstake the ${fmtUsd(deposit)} deposit (gas ~${fmtGas(gas)}, about 20 minutes); never sign a claim link from a DM or an ad.`,
  ];
  return { steps, deposit_usd: deposit, fees_usd: Math.round(fees * 100) / 100, tx_count: txCount, hold_days: hold };
}

// -------------------------------------------------------------------- build

export const REFIT_COUNT = 200;
export const REFIT_SEED = 20261114;
const SCOPE_MIN_RATIO = 0.01;
const SCOPE_MAX_RATIO = 3;

export function buildRadar(snapshot: Snapshot): RadarData {
  const asOfMs = Date.parse(snapshot.as_of);
  const watchlistSet = new Set(snapshot.watchlist);
  const penalties = [1e-6, 1e-6, 1e-6, 1e-6, 1e-6];

  // --- training set: live-token protocols whose token value still tracks TVL.
  const live = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const outOfScope = live.filter((p) => {
    const ratio = (p.mcap_usd as number) / p.tvl_usd;
    return ratio < SCOPE_MIN_RATIO || ratio > SCOPE_MAX_RATIO;
  });
  const comparable = live.filter((p) => {
    const ratio = (p.mcap_usd as number) / p.tvl_usd;
    return ratio >= SCOPE_MIN_RATIO && ratio <= SCOPE_MAX_RATIO;
  });
  const trainDesign = comparable.map((p) => features(p, asOfMs));
  const trainY = comparable.map((p) => Math.log(p.mcap_usd as number));
  const beta = huberFit(trainDesign, trainY, penalties);

  // --- validation: leave-one-out + walk-forward, on the comparable set.
  const looPred: number[] = [];
  const looActual: number[] = [];
  for (let i = 0; i < comparable.length; i++) {
    const subDesign = trainDesign.filter((_, j) => j !== i);
    const subY = trainY.filter((_, j) => j !== i);
    const b = huberFit(subDesign, subY, penalties);
    looPred.push(dot(b, trainDesign[i]));
    looActual.push(trainY[i]);
  }
  const loo = regressionMetrics(looActual, looPred);
  const inSample = regressionMetrics(trainY, trainDesign.map((x) => dot(beta, x)));

  const dated = comparable.filter((p) => p.listed_at !== null);
  const walkForward = ['2024-01-01', '2024-07-01'].map((cutoff) => {
    const trainIdx = dated.map((p, i) => ((p.listed_at as string) < cutoff ? i : -1)).filter((i) => i >= 0);
    const testIdx = dated.map((p, i) => ((p.listed_at as string) >= cutoff ? i : -1)).filter((i) => i >= 0);
    const d = dated.map((p) => features(p, asOfMs));
    const y = dated.map((p) => Math.log(p.mcap_usd as number));
    const b = huberFit(trainIdx.map((i) => d[i]), trainIdx.map((i) => y[i]), penalties);
    const m = regressionMetrics(testIdx.map((i) => y[i]), testIdx.map((i) => dot(b, d[i])));
    return {
      cutoff,
      train_n: trainIdx.length,
      test_n: testIdx.length,
      r2: m.r2,
      med_abs_log_err: m.med_abs_log_err,
      med_factor: Math.exp(m.med_abs_log_err),
      within_2x: m.within_2x,
      spearman: m.spearman,
    };
  });

  // --- the board: every strict pre-token protocol, ranked by fitted value.
  const strict = snapshot.protocols.filter(isStrictPreToken);
  const predicted = strict.map((p) => ({ p, value: Math.exp(dot(beta, features(p, asOfMs))) }));
  const rounded = predicted.map(({ p, value }) => ({ p, implied: Math.max(1, Math.round(value)) }));
  rounded.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  // --- rank ranges: 200 bootstrap refits, rank 5th–95th percentile each.
  const rng = mulberry32(REFIT_SEED);
  const strictIndex = new Map(strict.map((p, i) => [p.slug, i]));
  const rankSamples: number[][] = strict.map(() => []);
  for (let r = 0; r < REFIT_COUNT; r++) {
    const idx: number[] = [];
    for (let i = 0; i < comparable.length; i++) idx.push(Math.floor(rng() * comparable.length));
    const b = huberFit(idx.map((i) => trainDesign[i]), idx.map((i) => trainY[i]), penalties);
    const scored = strict
      .map((p) => ({ slug: p.slug, value: Math.exp(dot(b, features(p, asOfMs))) }))
      .sort((a, b2) => b2.value - a.value || (a.slug < b2.slug ? -1 : 1));
    scored.forEach((s, i) => rankSamples[strictIndex.get(s.slug) as number].push(i + 1));
  }
  const rankRange = new Map<string, { lo: number; hi: number }>();
  strict.forEach((p, i) => {
    const sorted = [...rankSamples[i]].sort((a, b) => a - b);
    rankRange.set(p.slug, { lo: quantileSorted(sorted, 0.05), hi: quantileSorted(sorted, 0.95) });
  });

  const rows: BoardRow[] = rounded.map(({ p, implied }, i) => {
    const plan = farmPlan(p, asOfMs);
    const range = rankRange.get(p.slug) as { lo: number; hi: number };
    const rank = i + 1;
    return {
      slug: p.slug,
      name: p.name,
      rank,
      implied_value_usd: implied,
      farm_steps: plan.steps,
      category: p.category,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: ageDays(p, asOfMs),
      chains: p.chains.length,
      primary_chain: p.chains.length > 0 ? p.chains[0] : 'Ethereum',
      rank_lo: Math.min(range.lo, rank),
      rank_hi: Math.max(range.hi, rank),
      deposit_usd: plan.deposit_usd,
      plan_fees_usd: plan.fees_usd,
      hold_days: plan.hold_days,
      watchlist: watchlistSet.has(p.slug),
    };
  });

  // --- account for the whole universe: every one of the 758 protocols.
  const liveRows: LiveRow[] = live
    .map((p) => {
      const ratio = (p.mcap_usd as number) / p.tvl_usd;
      const out = ratio < SCOPE_MIN_RATIO || ratio > SCOPE_MAX_RATIO;
      return {
        slug: p.slug,
        name: p.name,
        category: p.category,
        tvl_usd: p.tvl_usd,
        mcap_usd: p.mcap_usd as number,
        ratio,
        in_fit: !out,
        out_of_scope: out ? (ratio > SCOPE_MAX_RATIO ? 'token trades far above TVL' : 'token trades far below TVL') : null,
      };
    })
    .sort((a, b) => b.mcap_usd - a.mcap_usd);

  const excluded: ExcludedRow[] = snapshot.protocols
    .filter((p) => recordsNoToken(p) && exclusionReason(p) !== null)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      reason: exclusionReason(p) as string,
    }))
    .sort((a, b) => b.tvl_usd - a.tvl_usd);

  const excludedCounts: Record<string, number> = {};
  for (const e of excluded) excludedCounts[e.reason] = (excludedCounts[e.reason] ?? 0) + 1;

  const tokenNoMcap = snapshot.protocols.filter((p) => !recordsNoToken(p) && p.mcap_usd === null).length;
  const tokenZero = snapshot.protocols.filter((p) => !recordsNoToken(p) && p.mcap_usd === 0).length;
  const tokenBad = snapshot.protocols.filter((p) => !recordsNoToken(p) && p.mcap_usd !== null && p.mcap_usd < 0).length;

  const validation: Validation = {
    loo: {
      n: comparable.length,
      med_abs_log_err: loo.med_abs_log_err,
      med_factor: Math.exp(loo.med_abs_log_err),
      within_2x: loo.within_2x,
      spearman: loo.spearman,
    },
    walk_forward: walkForward,
    in_sample_r2: inSample.r2,
    refits: REFIT_COUNT,
  };

  const model: ModelMeta = {
    name: 'radar-3 (fitted log-linear, Huber-robust)',
    formula: 'log(mcap) = b0 + b1·log(TVL) + b2·log(1+growth) + b3·log(age) + b4·log(chains); implied = exp(prediction)',
    coefficients: {
      intercept: beta[0],
      log_tvl: beta[1],
      growth: beta[2],
      log_age: beta[3],
      log_chains: beta[4],
    },
    train_n: comparable.length,
    comparable_n: comparable.length,
    live_n: live.length,
    scope_min_ratio: SCOPE_MIN_RATIO,
    scope_max_ratio: SCOPE_MAX_RATIO,
    out_of_scope: outOfScope.map((p) => p.slug).sort(),
    age_default_days: AGE_DEFAULT_DAYS,
    growth_clamp: GROWTH_CLAMP,
  };

  return {
    meta: {
      as_of: snapshot.as_of,
      source: snapshot.source,
      floor_usd: snapshot.floor_usd,
      model: model.name,
      snapshot_protocols: snapshot.protocols.length,
    },
    model,
    validation,
    coverage: {
      total: snapshot.protocols.length,
      board: rows.length,
      watchlist: snapshot.watchlist.length,
      watchlist_on_board: rows.filter((r) => r.watchlist).length,
      live_with_mcap: live.length,
      live_in_fit: comparable.length,
      live_out_of_scope: outOfScope.length,
      token_no_mcap: tokenNoMcap,
      token_mcap_zero: tokenZero,
      token_mcap_bad: tokenBad,
      excluded_no_token: excludedCounts,
    },
    rows,
    live: liveRows,
    excluded,
    gas_table: GAS_TABLE,
  };
}

// ------------------------------------------------------------- gate checks

/** The gate, as the scorer states it, checked before anything is written. */
export function boardIssue(radar: RadarData, snapshot: Snapshot): string | null {
  const rows = radar.rows;
  if (rows.length < 100 || rows.length > 4000) return `board: ${rows.length} rows`;
  const slugs = new Set<string>();
  let prev = Number.POSITIVE_INFINITY;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (slugs.has(r.slug)) return `board: duplicate slug ${r.slug}`;
    slugs.add(r.slug);
    if (!snapshot.protocols.some((p) => p.slug === r.slug)) return `board: unknown slug ${r.slug}`;
    if (r.name.trim().length === 0) return `board: empty name ${r.slug}`;
    if (r.rank !== i + 1) return `board: rank ${r.rank} at position ${i + 1}`;
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `board: bad implied value ${r.slug}`;
    if (r.implied_value_usd > prev) return `board: implied value rises at rank ${r.rank}`;
    prev = r.implied_value_usd;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `board: ${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `board: ${r.slug} farm step of ${t.length} chars`;
    }
  }
  if (rows.every((r) => r.implied_value_usd === rows[0].implied_value_usd)) return 'board: all implied values equal';
  for (const slug of snapshot.watchlist) {
    if (!slugs.has(slug)) return `board: watchlist slug ${slug} missing`;
  }
  return null;
}
