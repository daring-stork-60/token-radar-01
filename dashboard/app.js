// Token Radar, model radar-2. The dashboard is a static page: it reads window.RADAR (data.js, written
// by main.ts from the same board.json the gate checks) and renders it. No fetch, no network, no framework.
//
// The page recomputes every row's implied value and farm plan from the snapshot figures with the same
// model main.ts runs. The recomputed number must match board.json: the breakdown in the detail view
// shows it, and the model panel states the constants so a reader can check them.
//
// Layout: a header, a lede with the facts, the top five as a spotlight, the board (search, category
// filter, pre-token / live-token tabs, sorting), the model panel, and a sandbox that re-ranks the top
// ten under a changed model. The detail view is a dialog, opened by click or by the hash (#p=<slug>),
// and the hash also carries the search, the category and the sort, so every view is a link.

const RADAR = window.RADAR;
const $ = (s) => document.querySelector(s);
const $board = $('#board');

const usd = (n) => (n === null || n === undefined ? '—' : '$' + Math.round(n).toLocaleString('en-US'));
const int = (n) => n.toLocaleString('en-US');
const pct = (n) => (n === null ? '—' : (n > 0 ? '+' : '') + n.toFixed(1) + '%');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** A date as a human span, or '—' when the protocol has no listed date. */
function ageText(p) {
  if (p.age_days === null) return '—';
  if (p.age_days < 30) return `${p.age_days}d`;
  if (p.age_days < 365) return `${(p.age_days / 30).toFixed(1)} mo`;
  return `${(p.age_days / 365).toFixed(1)}y`;
}
const chainList = (chains) => (chains.length === 0 ? '—' : chains.slice(0, 3).join(', ') + (chains.length > 3 ? ` +${chains.length - 3}` : ''));

/** The hash carries the view: ?q= search, ?category=, ?sort=, ?p= the open protocol. */
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  return { q: q.get('q') || '', category: q.get('category') || '', sort: q.get('sort') || 'rank', p: q.get('p') || '' };
}
function writeHash() {
  const q = new URLSearchParams();
  if (state.q) q.set('q', state.q);
  if (state.category) q.set('category', state.category);
  if (state.sort !== 'rank') q.set('sort', state.sort);
  if (state.p) q.set('p', state.p);
  const hash = q.toString();
  history.replaceState(null, '', hash ? `#${hash}` : location.pathname);
}

const SORTS = {
  rank: (a, b) => a.rank - b.rank,
  value: (a, b) => b.implied_value_usd - a.implied_value_usd || a.rank - b.rank,
  tvl: (a, b) => b.tvl_usd - a.tvl_usd || a.rank - b.rank,
  growth: (a, b) => (b.change_7d ?? 0) - (a.change_7d ?? 0) || a.rank - b.rank,
  age: (a, b) => (b.age_days ?? 0) - (a.age_days ?? 0) || a.rank - b.rank,
};

const state = { q: '', category: '', sort: 'rank', p: '', tab: 'pre' };
const fromHash = readHash();
state.q = fromHash.q;
state.category = fromHash.category;
state.sort = SORTS[fromHash.sort] ? fromHash.sort : 'rank';
state.p = fromHash.p;
const liveBySlug = new Map(RADAR.live.map((p) => [p.slug, p]));
const allCats = [...new Set(RADAR.rows.map((r) => r.category).filter(Boolean))].sort();
const top5 = RADAR.rows.slice(0, 5);
const maxImplied = RADAR.rows[0] ? RADAR.rows[0].implied_value_usd : 1;

/* The value model, written the same way in lib/model.ts. A reader can check the two against each
   other: the constants come from RADAR.model, the category multiples from RADAR.category_multiple. */
function impliedOf(p, model) {
  const m = model || RADAR.model;
  const age = p.age_days === null || p.age_days === undefined ? m.unknown_age_days : p.age_days;
  const catMult = p.category_multiple === undefined ? (RADAR.category_multiple[p.category] ?? RADAR.default_multiple) : p.category_multiple;
  const growth = clamp(p.change_7d ?? 0, m.growth_floor, m.growth_cap);
  const growthMult = 1 + (growth / 100) * m.growth_weight;
  const maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
  const chains = 1 + m.chain_step * Math.min(Math.max((p.chains || []).length - 1, 0), m.chain_cap);
  const implied = Math.max(1, Math.round(p.tvl_usd * catMult * growthMult * maturity * chains));
  return { implied, catMult, growth, growthMult, maturity, chains, age: p.age_days };
}

/* The farm plan, derived the same way in lib/model.ts: from the protocol's own record (category,
   chains, TVL, age), never from a hand-written list of names. */
function capitalFor(p) {
  if (p.tvl_usd >= 5e9) return 250;
  if (p.tvl_usd >= 1e9) return 150;
  if (p.tvl_usd >= 1e8) return 100;
  return 50;
}
function holdFor(age) {
  if (age === null || age === undefined) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}
function actionFor(p, capital, chain) {
  const c = (p.category || '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and keep the position open.`;
  if (c.includes('chain')) return `Use $${capital} of USDC in ${name}'s app on ${chain} and keep the position open.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}
function secondFor(p, capital, chain) {
  const c = (p.category || '').toLowerCase();
  const name = p.name;
  const small = Math.max(25, Math.round(capital / 2));
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow $${small} against the supplied collateral so the wallet shows a borrow position too.`;
  if (c.includes('dex')) return `Add a second position of $${small} in the protocol's highest-volume pool and vote if a governance vote opens.`;
  if (c.includes('yield')) return `Restake the receipt token in ${name}'s own yield vault on ${chain}.`;
  if (c.includes('bridge')) return `Bridge $${small} back so the wallet shows both directions of the route.`;
  if (c.includes('staking') || c.includes('restak')) return `Restake the receipt on a second chain ${name} supports, if it lists one.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close and reopen the hedge once so the position shows two fills.`;
  if (c.includes('prediction')) return `Settle the first position and place a second one for $${small}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Allocate $${small} to a second vault so the wallet shows two vault positions.`;
  if (c.includes('stable')) return `Hold the minted asset through one full redemption window.`;
  if (c.includes('rwa')) return `Check the yield asset's redemption window and hold through one full cycle.`;
  if (c.includes('insurance')) return `Renew the cover once so the policy shows two terms.`;
  if (c.includes('basis')) return `Check the funding rate the vault earns and hold through one funding cycle.`;
  return `Make a second, smaller deposit of $${small} so the wallet shows repeated activity.`;
}
function farmSteps(p) {
  const chain = p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain';
  const capital = capitalFor(p);
  const hold = holdFor(p.age_days);
  const action = actionFor(p, capital, chain);
  const second = secondFor(p, capital, chain);
  return [
    { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: action, cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, time: '15 minutes to set up' },
    { text: second, cost: `about $${capital >= 150 ? 6 : 3} of gas`, time: '10 minutes' },
    { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes, then write the wallet, the dates and every transaction in a farm log.", cost: 'no fee to check, and never pay to claim', time: '15 minutes' },
  ];
}

/** The rows the board shows under the current search, category and tab. */
function filteredRows() {
  const q = state.q.trim().toLowerCase();
  let rows = state.tab === 'live'
    ? RADAR.live.map((p) => ({ ...p, rank: 0, age_days: null, implied_value_usd: p.mcap_usd, category_multiple: null }))
    : RADAR.rows;
  if (state.category) rows = rows.filter((r) => r.category === state.category);
  if (q) rows = rows.filter((r) => (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().includes(q));
  if (state.tab === 'pre') rows = [...rows].sort(SORTS[state.sort]);
  return rows;
}

function render() {
  $board.setAttribute('aria-busy', 'false');
  const rows = filteredRows();
  const board = RADAR.rows;
  const top = board[0] || null;
  const catRows = allCats.map((c) => `<tr><td>${esc(c)}</td><td>${(RADAR.category_multiple[c] ?? RADAR.default_multiple).toFixed(2)}x</td></tr>`).join('');
  $board.innerHTML = `
<div class="shell">
  <header class="top">
    <div>
      <div class="brand"><span class="mark" aria-hidden="true"></span><span class="brand-name">Token Radar</span></div>
      <h1>Pre-token protocols, ranked by implied launch value</h1>
    </div>
    <div class="top-meta">
      <span>Snapshot ${esc(RADAR.as_of)} &middot; ${esc(RADAR.source)}</span>
      <span>Model ${esc(RADAR.model_version)}</span>
    </div>
  </header>
  <div class="lede">
    <div>
      <h2>Every protocol without a token, scored on its own numbers</h2>
      <p>The board ranks ${int(board.length)} pre-token protocols from the snapshot of ${esc(RADAR.as_of)}: the ${int(RADAR.watchlist_size)} on the watchlist, whose TVL clears the ${usd(RADAR.floor_usd)} floor, and the ${int(RADAR.beyond_size)} beyond it. The value is implied, not observed: TVL times the token's value per dollar for its business, adjusted for seven-day growth, for how long it has run with no token, and for how many chains it runs on. Nothing is hardcoded by name.</p>
      <p>The top value is ${top ? `${esc(top.name)} at ${usd(top.implied_value_usd)}` : 'not scored'}. Open a row to see how its value is built and how to farm it.</p>
    </div>
    <div class="facts">
      <div class="fact"><span>Protocols ranked</span><b>${int(board.length)}</b></div>
      <div class="fact"><span>On the watchlist</span><b>${int(RADAR.watchlist_size)}</b></div>
      <div class="fact"><span>Beyond the watchlist</span><b>${int(RADAR.beyond_size)}</b></div>
      <div class="fact"><span>Live-token protocols set aside</span><b>${int(RADAR.live_size)}</b></div>
      <div class="fact"><span>Top implied value</span><b>${top ? usd(top.implied_value_usd) : '—'}</b></div>
      <div class="fact"><span>Floor</span><b>${usd(RADAR.floor_usd)}</b></div>
    </div>
  </div>
  <section class="spotlight" aria-label="Top five">
    <h2>Top five</h2>
    <div class="spot-grid">
      ${top5.map((r) => `<button type="button" class="spot" data-slug="${esc(r.slug)}" aria-label="${esc(r.name)}, rank ${r.rank}, implied value ${usd(r.implied_value_usd)}">
        <span class="rank">#${r.rank}</span><b>${esc(r.name)}</b>
        <span class="sub">${esc(r.category || '—')} &middot; ${esc(chainList(r.chains))}</span>
        <span class="val">${usd(r.implied_value_usd)}</span>
      </button>`).join('')}
    </div>
  </section>
  <div class="controls">
    <div class="field"><label for="q">Search</label><input id="q" type="search" placeholder="Name, slug or category" value="${esc(state.q)}" autocomplete="off"></div>
    <div class="field"><label for="cat">Category</label><select id="cat">
      <option value="">All categories</option>
      ${allCats.map((c) => `<option value="${esc(c)}"${state.category === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}
    </select></div>
    <div class="field"><label for="sort">Sort</label><select id="sort">
      <option value="rank"${state.sort === 'rank' ? ' selected' : ''}>Implied value</option>
      <option value="tvl"${state.sort === 'tvl' ? ' selected' : ''}>TVL</option>
      <option value="growth"${state.sort === 'growth' ? ' selected' : ''}>7d growth</option>
      <option value="age"${state.sort === 'age' ? ' selected' : ''}>Age</option>
    </select></div>
    <div class="tabs" role="group" aria-label="Token status">
      <button type="button" data-tab="pre" aria-pressed="${state.tab === 'pre'}">Pre-token (${int(board.length)})</button>
      <button type="button" data-tab="live" aria-pressed="${state.tab === 'live'}">Live token (${int(RADAR.live_size)})</button>
    </div>
    <p class="count">${int(rows.length)} of ${state.tab === 'live' ? int(RADAR.live_size) : int(board.length)} shown</p>
  </div>
  <section class="panel" aria-label="Board">
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th><button type="button" data-sort="rank">Rank ${state.sort === 'rank' ? '↓' : ''}</button></th>
          <th>Protocol</th>
          <th><button type="button" data-sort="tvl">TVL ${state.sort === 'tvl' ? '↓' : ''}</button></th>
          <th><button type="button" data-sort="growth">7d ${state.sort === 'growth' ? '↓' : ''}</button></th>
          <th><button type="button" data-sort="age">Age ${state.sort === 'age' ? '↓' : ''}</button></th>
          <th>Implied value</th>
          <th>Token</th>
        </tr></thead>
        <tbody>
          ${rows.length === 0 ? `<tr><td colspan="7"><div class="empty"><h2>Nothing matches</h2><p>Try a different search or category.</p><button type="button" class="button" id="clear">Clear filters</button></div></td></tr>` : rows.map((r) => `
          <tr data-slug="${esc(r.slug)}" data-selected="${state.p === r.slug}">
            <td class="num">${r.rank ? '#' + r.rank : '—'}</td>
            <td><div class="name"><b>${esc(r.name)}${r.watchlist ? ' <span class="sub" style="color:var(--accent)">● Watchlist</span>' : ''}</b><span class="sub">${esc(r.category || '—')} &middot; ${esc(chainList(r.chains))}</span></div></td>
            <td class="num">${usd(r.tvl_usd)}</td>
            <td class="num ${r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'}">${pct(r.change_7d)}</td>
            <td class="num">${ageText(r)}</td>
            <td><div class="implied"><span class="num">${usd(r.implied_value_usd)}</span><span class="bar" aria-hidden="true"><i style="width:${Math.max(2, Math.round((r.implied_value_usd / maxImplied) * 100))}%"></i></span></div></td>
            <td>${state.tab === 'live' ? `<span class="status live">Live</span>` : `<span class="status">Pre-token</span>`}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </section>
  <section class="panel model" aria-label="The model">
    <h2>The model: radar-2</h2>
    <p class="formula">implied = max(1, round(TVL &times; category &times; growth &times; maturity &times; chains))<br>
    growth = clamp(change_7d, ${RADAR.model.growth_floor}, ${RADAR.model.growth_cap})%; growth multiplier = 1 + (growth &divide; 100) &times; ${RADAR.model.growth_weight}<br>
    maturity = ${RADAR.model.maturity_floor} + min(age, ${RADAR.model.maturity_days}) &divide; ${RADAR.model.maturity_days} &times; ${RADAR.model.maturity_range} &nbsp;(age unknown: ${RADAR.model.unknown_age_days} days)<br>
    chains = 1 + ${RADAR.model.chain_step} &times; min(chains &minus; 1, ${RADAR.model.chain_cap})</p>
    <table class="cat-table"><thead><tr><th>Category</th><th>Value per $1 of TVL</th></tr></thead><tbody>${catRows}</tbody></table>
    <p>The category is the token's value per dollar of TVL: a DEX or lending token trades on its own cash flow, so a dollar of its TVL backs more token value than a dollar of a chain's TVL. The band is narrow on purpose, 0.2 to 0.35: category adjusts the value, it never decides it. Bridges, staking receipts and wrappers are not in this table at all: they are a claim on an asset that already exists, not a protocol launching a token, so they are not ranked beyond the watchlist. Growth is clamped so one hot week cannot carry a protocol, and age is capped at four years so a long wait stops adding value. No protocol name is ever special-cased: one function scores every row, and the same function runs in this page and in the scorer.</p>
  </section>
  <section class="panel sandbox" aria-label="Try the model">
    <h2>Try the model</h2>
    <p>Move a constant and the top ten re-rank under the changed model. This is an exploration tool: the board above always keeps the stated model.</p>
    <div class="sliders">
      <div class="slider"><label for="sb-growth">Growth weight <b id="sb-growth-v">${sandbox.growth_weight.toFixed(2)}</b></label><input id="sb-growth" type="range" min="0.3" max="1.2" step="0.05" value="${sandbox.growth_weight}"></div>
      <div class="slider"><label for="sb-base">Category scale <b id="sb-base-v">${sandbox.base_scale.toFixed(2)}&times;</b></label><input id="sb-base" type="range" min="0.5" max="1.5" step="0.05" value="${sandbox.base_scale}"></div>
      <div class="slider"><label for="sb-maturity">Maturity floor <b id="sb-maturity-v">${sandbox.maturity_floor.toFixed(2)}</b></label><input id="sb-maturity" type="range" min="0.3" max="0.8" step="0.05" value="${sandbox.maturity_floor}"></div>
    </div>
    <div class="top10" id="sb-top10"></div>
  </section>
</div>
<dialog class="detail" id="detail"></dialog>`;

  wire();
  renderSandbox();
  if (state.p) openDetail(state.p);
}

const sandbox = { growth_weight: RADAR.model.growth_weight, base_scale: 1, maturity_floor: RADAR.model.maturity_floor };

function renderSandbox() {
  const el = $('#sb-top10');
  if (!el) return;
  const model = { ...RADAR.model, growth_weight: sandbox.growth_weight, maturity_floor: sandbox.maturity_floor };
  const ranked = RADAR.rows.map((r) => {
    const v = impliedOf(r, model);
    const catMult = (RADAR.category_multiple[r.category] ?? RADAR.default_multiple) * sandbox.base_scale;
    const implied = Math.max(1, Math.round(r.tvl_usd * catMult * v.growthMult * v.maturity * v.chains));
    return { name: r.name, implied };
  }).sort((a, b) => b.implied - a.implied || (a.name < b.name ? -1 : 1)).slice(0, 10);
  el.innerHTML = ranked.map((r, i) => `<div><span>${i + 1}. ${esc(r.name)}</span><b>${usd(r.implied)}</b></div>`).join('');
}

function openDetail(slug) {
  const dlg = $('#detail');
  const row = RADAR.rows.find((r) => r.slug === slug);
  const live = liveBySlug.get(slug);
  if (!row && !live) return;
  const p = row || live;
  const isLive = !row;
  const v = row ? impliedOf(row) : null;
  const steps = row ? farmSteps(row) : [];
  const recomputed = v ? v.implied : null;
  const matches = recomputed === null ? null : recomputed === row.implied_value_usd;
  dlg.innerHTML = `
  <div class="detail-head">
    <div>
      <span class="sub">${esc(p.category || '—')} &middot; ${esc(chainList(p.chains))}</span>
      <h2>${esc(p.name)}</h2>
      <span class="sub">${isLive ? `Live token &middot; market cap ${usd(p.mcap_usd)}` : `Pre-token &middot; rank #${row.rank} of ${int(RADAR.rows.length)} &middot; implied value ${usd(row.implied_value_usd)} &middot; ${row.watchlist ? 'on the watchlist' : 'beyond the watchlist'}`}</span>
    </div>
    <button type="button" class="close" data-close>Close</button>
  </div>
  ${isLive ? `
  <section class="detail-section">
    <h3>Why it is not on the board</h3>
    <p>This protocol already trades. Its value is the market's own: a market cap of ${usd(p.mcap_usd)} on ${usd(p.tvl_usd)} of TVL. The board ranks only protocols with no token, so a live protocol never takes a pre-token rank.</p>
  </section>` : `
  <section class="detail-section">
    <h3>How the value is built</h3>
    <div class="equation">
      <div><span>TVL &times; category ${v.catMult.toFixed(2)}&times; (${esc(row.category || 'no category')})</span><b>${usd(row.tvl_usd * v.catMult)}</b></div>
      <div><span>7d growth ${v.growth.toFixed(1)}% &rarr; multiplier ${v.growthMult.toFixed(2)}&times;</span><b>&times; ${v.growthMult.toFixed(2)}</b></div>
      <div><span>Age ${v.age === null ? 'unknown' : int(v.age) + ' days'} &rarr; maturity ${v.maturity.toFixed(2)}&times;</span><b>&times; ${v.maturity.toFixed(2)}</b></div>
      <div><span>${row.chains.length} chain${row.chains.length === 1 ? '' : 's'} &rarr; chains ${v.chains.toFixed(2)}&times;</span><b>&times; ${v.chains.toFixed(2)}</b></div>
      <div><span>Implied value (recomputed in this page)</span><b>${usd(recomputed)}</b></div>
      <div><span>Implied value (board.json)</span><b>${usd(row.implied_value_usd)}</b></div>
      <div><span>Recomputed value ${matches ? 'matches' : 'does not match'} the board</span><b>${matches ? '✓' : '✗'}</b></div>
    </div>
  </section>
  <section class="detail-section">
    <h3>How to farm it</h3>
    <ol class="steps">
      ${steps.map((s) => `<li><b>${esc(s.text)}</b><span class="cost">Cost: ${esc(s.cost)}. Time: ${esc(s.time)}.</span></li>`).join('')}
    </ol>
    <p style="margin-top:12px;color:var(--muted);font-size:13px">The plan is derived from this protocol's own record: its category sets the action, its TVL sets the capital, its age sets the hold. Use a fresh wallet, keep its seed phrase offline, and never pay to claim.</p>
  </section>`}
  <section class="detail-section">
    <h3>Snapshot record</h3>
    <div class="equation">
      <div><span>TVL</span><b>${usd(p.tvl_usd)}</b></div>
      <div><span>7d change</span><b>${pct(p.change_7d)}</b></div>
      <div><span>Listed</span><b>${esc(p.listed_at || '—')}</b></div>
      <div><span>Chains</span><b>${esc(p.chains.join(', ') || '—')}</b></div>
      <div><span>Snapshot</span><b>${esc(RADAR.as_of)}</b></div>
    </div>
  </section>`;
  dlg.showModal();
  dlg.querySelector('[data-close]').addEventListener('click', () => closeDetail());
  dlg.addEventListener('close', () => {
    if (state.p) { state.p = ''; writeHash(); }
  }, { once: true });
}

function closeDetail() {
  const dlg = $('#detail');
  if (dlg && dlg.open) dlg.close();
  if (state.p) { state.p = ''; writeHash(); }
}

function wire() {
  const q = $('#q');
  const cat = $('#cat');
  const sort = $('#sort');
  q.addEventListener('input', () => { state.q = q.value; writeHash(); render(); const el = $('#q'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
  cat.addEventListener('change', () => { state.category = cat.value; writeHash(); render(); });
  sort.addEventListener('change', () => { state.sort = sort.value; writeHash(); render(); });
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.tab; render(); }));
  document.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => { state.sort = b.dataset.sort; writeHash(); render(); }));
  document.querySelectorAll('tbody tr[data-slug]').forEach((tr) => tr.addEventListener('click', () => { state.p = tr.dataset.slug; writeHash(); render(); }));
  document.querySelectorAll('.spot[data-slug]').forEach((b) => b.addEventListener('click', () => { state.p = b.dataset.slug; writeHash(); render(); }));
  const clear = $('#clear');
  if (clear) clear.addEventListener('click', () => { state.q = ''; state.category = ''; writeHash(); render(); });
  const sbGrowth = $('#sb-growth');
  const sbBase = $('#sb-base');
  const sbMaturity = $('#sb-maturity');
  if (sbGrowth) sbGrowth.addEventListener('input', () => { sandbox.growth_weight = parseFloat(sbGrowth.value); $('#sb-growth-v').textContent = sandbox.growth_weight.toFixed(2); renderSandbox(); });
  if (sbBase) sbBase.addEventListener('input', () => { sandbox.base_scale = parseFloat(sbBase.value); $('#sb-base-v').textContent = sandbox.base_scale.toFixed(2) + '×'; renderSandbox(); });
  if (sbMaturity) sbMaturity.addEventListener('input', () => { sandbox.maturity_floor = parseFloat(sbMaturity.value); $('#sb-maturity-v').textContent = sandbox.maturity_floor.toFixed(2); renderSandbox(); });
}

if (!RADAR || !RADAR.rows) {
  $board.innerHTML = '<div class="shell"><div class="empty"><h2>Token Radar found no data</h2><p>The page needs data.js beside it: run main.ts so /output/data.js exists.</p></div></div>';
  $board.setAttribute('aria-busy', 'false');
} else {
  render();
}
