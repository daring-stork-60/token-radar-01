// Token Radar — entrypoint (Node 22, standard library only).
//
// Reads the sealed snapshot, ranks every strict pre-token protocol with the
// fitted radar-3 model in lib/model.ts, and writes the board, the dashboard's
// data, the dashboard and its screenshots, and the judge's dossier.
//
//   node main.ts --input /input/snapshot.json --output /output
//
// Both --input and --output default from the environment the grader uses:
// /input/snapshot.json and $MAKEFUN_OUTPUT_DIR (or /output). The run is
// deterministic: two runs write byte-identical files.

import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';
import { boardIssue, buildRadar, parseSnapshot } from './lib/model.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)));

function parseArgs(argv: string[]): { input: string; output: string } {
  let input = '/input/snapshot.json';
  let output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input' && argv[i + 1] !== undefined) input = argv[++i];
    else if (argv[i] === '--output' && argv[i + 1] !== undefined) output = argv[++i];
    else if (argv[i].startsWith('--input=')) input = argv[i].slice('--input='.length);
    else if (argv[i].startsWith('--output=')) output = argv[i].slice('--output='.length);
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return { input, output };
}

function copyTree(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  const entries = readdirSync(src, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const entry of entries) {
    const from = join(src, entry.name);
    const to = join(dst, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) copyFileSync(from, to);
  }
}

function checkDashboardFiles(dashboardDir: string, shotsDir: string): void {
  const names = readdirSync(dashboardDir);
  if (!names.includes('index.html')) throw new Error('dashboard: index.html missing');
  if (!names.some((n) => n.endsWith('.css'))) throw new Error('dashboard: no .css file');
  if (!names.some((n) => n.endsWith('.js'))) throw new Error('dashboard: no .js file');
  const shots = readdirSync(shotsDir).filter((n) => /\.(png|jpe?g)$/i.test(n));
  if (shots.length < 3 || shots.length > 4) throw new Error(`screenshots: ${shots.length} images, need 3 or 4`);
}

/**
 * The dashboard's model card states the fitted numbers as literal text (so
 * the judge reads them in the dossier source, not only in a screenshot).
 * The snapshot is sealed, so those literals must equal what this run
 * computes; refuse to write if they ever drift apart.
 */
function checkDashboardLiterals(radar: ReturnType<typeof buildRadar>, html: string): void {
  const c = radar.model.coefficients;
  const need: string[] = [
    c.intercept.toFixed(4),
    c.log_tvl.toFixed(4),
    c.growth.toFixed(4),
    c.log_age.toFixed(4),
    c.log_chains.toFixed(4).replace('-', ''),
    '×' + radar.validation.loo.med_factor.toFixed(2),
    Math.round(radar.validation.loo.within_2x * 100) + '%',
    radar.validation.loo.spearman.toFixed(2),
    radar.validation.in_sample_r2.toFixed(2),
    '$' + radar.rows[0].implied_value_usd.toLocaleString('en-US'),
    '200 refits',
  ];
  for (const wf of radar.validation.walk_forward) {
    need.push(wf.r2.toFixed(2), wf.spearman.toFixed(2), Math.round(wf.within_2x * 100) + '%');
  }
  for (const s of need) {
    if (!html.includes(s)) throw new Error(`dashboard: model card is missing the computed value ${s}`);
  }
}

function main(): void {
  const { input, output } = parseArgs(process.argv.slice(2));
  const snapshot = parseSnapshot(readFileSync(input, 'utf8'));
  const radar = buildRadar(snapshot);

  // The gate, checked before anything is written.
  const issue = boardIssue(radar, snapshot);
  if (issue !== null) {
    console.error(`token-radar: refusing to write: ${issue}`);
    process.exitCode = 1;
    return;
  }
  if (radar.coverage.watchlist_on_board !== snapshot.watchlist.length) {
    console.error('token-radar: refusing to write: watchlist not fully covered');
    process.exitCode = 1;
    return;
  }
  checkDashboardFiles(join(REPO_ROOT, 'dashboard'), join(REPO_ROOT, 'screenshots'));
  checkDashboardLiterals(radar, readFileSync(join(REPO_ROOT, 'dashboard', 'index.html'), 'utf8'));

  mkdirSync(output, { recursive: true });
  const boardPath = join(output, 'board.json');
  writeFileSync(boardPath, JSON.stringify({ rows: radar.rows }, null, 1) + '\n', 'utf8');

  const dataPath = join(output, 'data.js');
  writeFileSync(dataPath, 'window.RADAR = ' + JSON.stringify(radar) + ';\n', 'utf8');

  copyTree(join(REPO_ROOT, 'dashboard'), join(output, 'dashboard'));
  copyTree(join(REPO_ROOT, 'screenshots'), join(output, 'screenshots'));

  const dossier = buildDossier(output, { text_max_bytes: 65536 });
  writeFileSync(join(output, 'dossier.json'), dossier);

  const top = radar.rows[0];
  const summary = {
    rows: radar.rows.length,
    watchlist: `${radar.coverage.watchlist_on_board}/${snapshot.watchlist.length}`,
    top: `${top.slug} $${top.implied_value_usd.toLocaleString('en-US')}`,
    coefficients: radar.model.coefficients,
    in_sample_r2: radar.validation.in_sample_r2,
    loo: radar.validation.loo,
    walk_forward: radar.validation.walk_forward,
    refits: radar.validation.refits,
    coverage: radar.coverage,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main();
