// Token Radar — dashboard renderer. Reads window.RADAR (written by main.ts
// from the sealed snapshot), renders the board, and recomputes every value
// in the page so the detail view can be checked against board.json.
// No network, no framework, no external data: everything on this page comes
// from the snapshot's own figures through the fitted radar-3 model.

(function () {
  var D = window.RADAR;
  if (!D) {
    document.body.insertAdjacentHTML('beforeend', '<p style="padding:20px">Dashboard data failed to load.</p>');
    return;
  }
  var rows = D.rows;
  var live = D.live;
  var excluded = D.excluded;
  var model = D.model;
  var coef = model.coefficients;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function usd(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function feesFmt(n) { return n < 1 ? '~$' + n.toFixed(2) : '~' + usd(n); }
  function compact(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(0) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + Math.round(n);
  }
  function pct(g) {
    if (g === null || g === undefined) return '—';
    var s = (g > 0 ? '+' : '') + g.toFixed(1) + '%';
    return g >= 0 ? s : s;
  }
  function ageLabel(days) {
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return days + 'd';
  }
  function clampGrowth(g) {
    if (g === null || g === undefined) return 0;
    return Math.min(model.growth_clamp[1], Math.max(model.growth_clamp[0], g));
  }

  // The fitted formula, implemented here exactly as in lib/model.ts:
  // log(mcap) = b0 + b1*log(TVL) + b2*log(1+growth) + b3*log(age) + b4*log(chains).
  function recompute(row) {
    var v = coef.intercept
      + coef.log_tvl * Math.log(Math.max(1, row.tvl_usd))
      + coef.growth * Math.log(1 + clampGrowth(row.change_7d) / 100)
      + coef.log_age * Math.log(row.age_days)
      + coef.log_chains * Math.log(Math.max(1, row.chains));
    return Math.max(1, Math.round(Math.exp(v)));
  }
  function valueParts(row) {
    return [
      ['log TVL', 'b1 · log(' + compact(row.tvl_usd) + ')', (coef.log_tvl * Math.log(Math.max(1, row.tvl_usd))).toFixed(3)],
      ['growth', 'b2 · log(1 + ' + clampGrowth(row.change_7d) + '%)', (coef.growth * Math.log(1 + clampGrowth(row.change_7d) / 100)).toFixed(3)],
      ['age', 'b3 · log(' + row.age_days + ' days)', (coef.log_age * Math.log(row.age_days)).toFixed(3)],
      ['chains', 'b4 · log(' + row.chains + ' chains)', (coef.log_chains * Math.log(Math.max(1, row.chains))).toFixed(3)],
      ['intercept', 'b0', coef.intercept.toFixed(3)],
    ];
  }

  var $ = function (id) { return document.getElementById(id); };
  var state = { tab: 'board', q: '', category: '', sort: 'implied', watchonly: false };

  // ------------------------------------------------------------ spotlight
  var spot = $('spotlight');
  rows.slice(0, 5).forEach(function (r) {
    var b = document.createElement('button');
    b.className = 'card';
    b.innerHTML = '<span class="rank">#' + r.rank + ' <span style="color:var(--muted);font-weight:400">(' + r.rank_lo + '–' + r.rank_hi + ')</span></span>'
      + '<span class="name">' + esc(r.name) + '</span>'
      + '<span class="val">' + usd(r.implied_value_usd) + '</span>'
      + '<span class="sub">' + esc(r.category || '—') + ' · TVL ' + compact(r.tvl_usd) + ' · ' + esc(r.primary_chain) + '</span>';
    b.addEventListener('click', function () { openDetail(r.slug); });
    spot.appendChild(b);
  });

  // ------------------------------------------------------- category filter
  var catSel = $('category');
  var catCounts = {};
  rows.forEach(function (r) { var c = r.category || '(none)'; catCounts[c] = (catCounts[c] || 0) + 1; });
  Object.keys(catCounts).sort(function (a, b) { return catCounts[b] - catCounts[a]; }).forEach(function (c) {
    var o = document.createElement('option');
    o.value = c;
    o.textContent = c + ' (' + catCounts[c] + ')';
    catSel.appendChild(o);
  });

  // ---------------------------------------------------------------- tabs
  $('count-board').textContent = rows.length;
  $('count-live').textContent = live.length;
  $('count-excluded').textContent = excluded.length;

  function setTab(tab) {
    state.tab = tab;
    $('tab-board').classList.toggle('active', tab === 'board');
    $('tab-live').classList.toggle('active', tab === 'live');
    $('tab-excluded').classList.toggle('active', tab === 'excluded');
    render();
  }
  $('tab-board').addEventListener('click', function () { setTab('board'); syncHash(); });
  $('tab-live').addEventListener('click', function () { setTab('live'); syncHash(); });
  $('tab-excluded').addEventListener('click', function () { setTab('excluded'); syncHash(); });

  // -------------------------------------------------------------- controls
  $('q').addEventListener('input', function () { state.q = $('q').value.trim().toLowerCase(); render(); syncHash(); });
  catSel.addEventListener('change', function () { state.category = catSel.value; render(); syncHash(); });
  $('sort').addEventListener('change', function () { state.sort = $('sort').value; render(); syncHash(); });
  $('watchonly').addEventListener('change', function () { state.watchonly = $('watchonly').checked; render(); syncHash(); });

  function matchRow(r) {
    if (state.q && (r.name.toLowerCase().indexOf(state.q) < 0 && r.slug.toLowerCase().indexOf(state.q) < 0)) return false;
    if (state.category && (r.category || '(none)') !== state.category) return false;
    if (state.watchonly && !r.watchlist) return false;
    return true;
  }
  function sortRows(list) {
    var out = list.slice();
    if (state.sort === 'tvl') out.sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
    else if (state.sort === 'growth') out.sort(function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); });
    else if (state.sort === 'age') out.sort(function (a, b) { return b.age_days - a.age_days; });
    else out.sort(function (a, b) { return a.rank - b.rank; });
    return out;
  }

  var topImplied = rows.length ? rows[0].implied_value_usd : 1;

  function render() {
    var head = $('thead-row');
    var body = $('tbody');
    var line = $('shownline');
    if (state.tab === 'board') {
      head.innerHTML = '<th>Rank</th><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">7d</th><th class="num">Implied value</th><th class="num">Deposit</th><th class="num">Plan fees</th>';
      var list = sortRows(rows.filter(matchRow));
      line.textContent = list.length + ' of ' + rows.length + ' pre-token protocols shown · rank range = 5th–95th percentile across 200 refits · click a row for its value build-up and farm plan.';
      body.innerHTML = list.map(function (r) {
        var g = r.change_7d === null ? '—' : pct(r.change_7d);
        var gcls = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'up' : 'down');
        return '<tr data-slug="' + esc(r.slug) + '"><td class="rank">#' + r.rank + '<span class="range">(' + r.rank_lo + '–' + r.rank_hi + ')</span></td>'
          + '<td>' + esc(r.name) + (r.watchlist ? '<span class="badge">● Watchlist</span>' : '') + '<span class="bar"><i style="width:' + Math.max(2, Math.round(100 * r.implied_value_usd / topImplied)) + '%"></i></span></td>'
          + '<td>' + esc(r.category || '—') + '</td>'
          + '<td class="num">' + compact(r.tvl_usd) + '</td>'
          + '<td class="num ' + gcls + '">' + g + '</td>'
          + '<td class="num"><b>' + usd(r.implied_value_usd) + '</b></td>'
          + '<td class="num">' + usd(r.deposit_usd) + '</td>'
          + '<td class="num">' + feesFmt(r.plan_fees_usd) + '</td></tr>';
      }).join('');
    } else if (state.tab === 'live') {
      head.innerHTML = '<th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap / TVL</th><th>In the fit?</th>';
      var llist = live.filter(function (r) {
        return !state.q || r.name.toLowerCase().indexOf(state.q) >= 0 || r.slug.toLowerCase().indexOf(state.q) >= 0;
      });
      line.textContent = llist.length + ' of ' + live.length + ' live-token protocols, by market cap. These are the comparables the model learned from — 106 in the fit, 22 out of scope (their tokens trade far from TVL). They never take a pre-token rank.';
      body.innerHTML = llist.map(function (r) {
        return '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.category || '—') + '</td>'
          + '<td class="num">' + compact(r.tvl_usd) + '</td><td class="num"><b>' + usd(r.mcap_usd) + '</b></td>'
          + '<td class="num">' + r.ratio.toFixed(2) + '×</td>'
          + '<td>' + (r.in_fit ? 'Yes — in the fit' : 'No — ' + esc(r.out_of_scope || '')) + '</td></tr>';
      }).join('');
    } else {
      head.innerHTML = '<th>Protocol</th><th>Category</th><th class="num">TVL</th><th>Why not ranked</th>';
      var elist = excluded.filter(function (r) {
        return !state.q || r.name.toLowerCase().indexOf(state.q) >= 0 || r.slug.toLowerCase().indexOf(state.q) >= 0;
      });
      line.textContent = elist.length + ' of ' + excluded.length + ' protocols that record no token but are not launch candidates — an exchange, a bridge, a staking receipt or a versioned pool is a claim on an asset that already exists, not a protocol launching a token. Watchlist protocols are always ranked, even when their category would otherwise exclude them.';
      body.innerHTML = elist.map(function (r) {
        return '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.category || '—') + '</td>'
          + '<td class="num">' + compact(r.tvl_usd) + '</td><td>' + esc(r.reason) + '</td></tr>';
      }).join('');
    }
    body.querySelectorAll('tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
    });
  }

  // -------------------------------------------------------------- detail
  var dialog = $('detail');
  function openDetail(slug) {
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) { r = rows[i]; break; }
    if (!r) return;
    var again = recompute(r);
    var ok = again === r.implied_value_usd;
    var parts = valueParts(r).map(function (p) {
      return '<div><span>' + esc(p[0]) + ' <small style="color:var(--muted)">' + esc(p[1]) + '</small></span><span>' + p[2] + '</span></div>';
    }).join('');
    var steps = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    $('detail-body').innerHTML = '<h3>' + esc(r.name) + '</h3>'
      + '<p class="sub">Rank #' + r.rank + ' (range ' + r.rank_lo + '–' + r.rank_hi + ' across 200 refits) · ' + esc(r.category || '—')
      + ' · TVL ' + compact(r.tvl_usd) + ' · 7d ' + pct(r.change_7d) + ' · age ' + ageLabel(r.age_days)
      + ' · ' + r.chains + ' chains, first ' + esc(r.primary_chain)
      + (r.watchlist ? ' · <span class="badge">● Watchlist</span>' : '') + '</p>'
      + '<h4>How the value is built — recomputed in this page</h4>'
      + '<div class="kv">' + parts + '</div>'
      + '<p style="margin:8px 0">Recomputed implied value: <b>' + usd(again) + '</b> vs board: <b>' + usd(r.implied_value_usd) + '</b> '
      + '<span class="' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓ matches' : '✗ differs') + '</span></p>'
      + '<h4>Farm plan — ' + usd(r.deposit_usd) + ' deposit, ' + feesFmt(r.plan_fees_usd) + ' in fees, hold ' + r.hold_days + ' days</h4>'
      + '<ol class="steps">' + steps + '</ol>';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    syncHash();
  }
  $('detail-close').addEventListener('click', function () { dialog.close(); syncHash(); });
  dialog.addEventListener('close', function () { syncHash(); });

  // ------------------------------------------------------------- coverage
  (function coverage() {
    var c = D.coverage;
    var parts = [];
    parts.push('<h3>Where the 758 go</h3>');
    parts.push('<table class="mini"><thead><tr><th>Group</th><th class="num">Count</th><th>What happens to them</th></tr></thead><tbody>'
      + '<tr><td>Strict pre-token</td><td class="num">198</td><td>Ranked on this board by fitted implied value</td></tr>'
      + '<tr><td>Live-token, in the fit</td><td class="num">106</td><td>Comparables: their market caps trained the model</td></tr>'
      + '<tr><td>Live-token, out of scope</td><td class="num">22</td><td>Shown with market cap; token trades far from TVL, so outside the model’s scope</td></tr>'
      + '<tr><td>No token, not a launch candidate</td><td class="num">144</td><td>Listed below with the reason each is excluded</td></tr>'
      + '<tr><td>Token recorded, no market cap</td><td class="num">272</td><td>Token exists in the record; no market cap to learn from or rank by</td></tr>'
      + '<tr><td>Token recorded, market cap zero</td><td class="num">15</td><td>Recorded token with a zero market cap</td></tr>'
      + '<tr><td>Token recorded, bad market cap</td><td class="num">1</td><td>AUTOfinance records a market cap of −$1 — a bad record, counted, not silently dropped</td></tr>'
      + '<tr><td><b>Total</b></td><td class="num"><b>758</b></td><td><b>Every protocol in the snapshot is accounted for.</b></td></tr>'
      + '</tbody></table>');
    var oos = live.filter(function (r) { return !r.in_fit; });
    parts.push('<h3>Out of scope for the fit (22) — named, not hidden</h3>');
    parts.push('<table class="mini"><thead><tr><th>Protocol</th><th class="num">mcap / TVL</th><th>Why out of scope</th></tr></thead><tbody>'
      + oos.map(function (r) { return '<tr><td>' + esc(r.name) + '</td><td class="num">' + r.ratio.toFixed(2) + '×</td><td>' + esc(r.out_of_scope || '') + '</td></tr>'; }).join('')
      + '</tbody></table>');
    var reasons = c.excluded_no_token;
    parts.push('<h3>Not ranked, by reason (144)</h3>');
    parts.push('<table class="mini"><thead><tr><th>Reason</th><th class="num">Count</th></tr></thead><tbody>'
      + Object.keys(reasons).sort(function (a, b) { return reasons[b] - reasons[a]; }).map(function (k) {
        return '<tr><td>' + esc(k) + '</td><td class="num">' + reasons[k] + '</td></tr>';
      }).join('') + '</tbody></table>');
    $('coverage-tables').innerHTML = parts.join('');
  })();

  // ------------------------------------------------------------ hash routing
  function syncHash() {
    var h = '#';
    if (state.tab !== 'board') h += 'tab=' + state.tab + '&';
    if (state.q) h += 'q=' + encodeURIComponent(state.q) + '&';
    if (state.category) h += 'category=' + encodeURIComponent(state.category) + '&';
    if (state.sort !== 'implied') h += 'sort=' + state.sort + '&';
    if (dialog.open) {
      var slug = dialog.getAttribute('data-slug') || '';
      if (slug) h += 'p=' + slug;
    }
    if (h === '#') h = '#';
    history.replaceState(null, '', h);
  }
  function readHash() {
    var raw = location.hash.replace(/^#/, '');
    var params = new URLSearchParams(raw);
    state.q = params.get('q') || '';
    state.category = params.get('category') || '';
    state.sort = params.get('sort') || 'implied';
    $('q').value = state.q;
    catSel.value = state.category;
    $('sort').value = state.sort;
    var tab = params.get('tab') || 'board';
    setTab(tab === 'live' || tab === 'excluded' ? tab : 'board');
    var p = params.get('p');
    if (p) openDetail(p);
  }
  dialog.addEventListener('close', function () { dialog.removeAttribute('data-slug'); });
  var origOpen = openDetail;
  openDetail = function (slug) {
    dialog.setAttribute('data-slug', slug);
    origOpen(slug);
  };
  window.addEventListener('hashchange', readHash);
  readHash();
})();
