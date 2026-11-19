# Token Radar — NOTES

Entry untuk **token-radar-01** ("Build the best token launch radar"), akun @daring-stork-60
(wallet A1). Hadiah $1.325 (1st $1.000, 2nd–5th $50, 6th–10th $25). Tutup
**2026-12-14T10:00:00Z**. Tidak ada entry fee (entry_fee null). Kompetisi **bundle** (bukan
strict-transcripts): deliverable = repo GitHub publik + commit SHA + transcript bundle.
**JANGAN submit, JANGAN buat repo GitHub** — tugas ini hanya membangun entry dan melapor.

## Yang dibangun

Repo `~/workspace/make-fun/token-radar-01/`:

- `main.ts` — entrypoint (Node 22, stdlib only). Membaca `/input/snapshot.json`
  (atau `--input`), menilai board dengan model di `lib/model.ts`, menulis
  `/output/board.json`, `/output/data.js`, menyalin `dashboard/` + `screenshots/` ke
  `/output`, menulis `/output/dossier.json` via library vendored `buildDossier`.
  Menolak board yang gagal gate (`boardIssue`) sebelum menulis apa pun.
- `lib/model.ts` — model **radar-2** + farm plan + board + radar data. Lihat bawah.
- `vendor/makefun-board.ts` — library make.fun `buildDossier` (disediakan kit, disalin
  apa adanya; diperlukan agar dossier byte-for-byte sama).
- `dashboard/index.html`, `dashboard/app.css`, `dashboard/app.js` — dashboard statis
  (tanpa framework, tanpa network). Total sumber dashboard 36.681 byte (di bawah cap
  dossier 65.536 byte, jadi seluruh sumber terbaca utuh oleh judge).
- `screenshots/` — 3 PNG 1280×800 dari dashboard asli (bukan placeholder):
  `1-board.png` (155.910 B), `2-detail.png` (202.771 B), `3-filtered.png` (156.106 B).
- `LICENSE` MIT, `README.md` (badge make.fun dengan placeholder {owner}/{repo}/
  {referral_code} untuk diisi parent saat repo GitHub dibuat).

## Model radar-2

Implied value hanya dari angka snapshot — tidak ada nama protokol yang diistimewakan:

```
implied = max(1, round(TVL × category × growth × maturity × chains))
growth    = clamp(change_7d, -60, 200)%;  growthMult    = 1 + (growth/100) × 0,7
maturity  = 0,55 + min(age, 1460)/1460 × 0,45   (age tidak diketahui → 365 hari)
chains    = 1 + 0,02 × min(chains-1, 5)
category  = nilai token per $1 TVL menurut kategori (Dexs/Lending 0,35; Yield/
            Derivatives 0,30; CDP/Risk Curators/Onchain Capital Allocator/
            Collateral Markets 0,28; RWA/Restaking/Basis Trading/Insurance/
            Payments/CeDeFi 0,25; Chain 0,20; default 0,25). Band sengaja sempit
            (0,20–0,35): kategori menyesuaikan nilai, bukan menentukannya.
```

Board = **197 baris** (semua protokol pre-token yang bisa diranking):
- 40 watchlist (TVL ≥ floor $50.000.000) — semuanya ada (coverage gate).
- 157 di luar watchlist: 139 di bawah floor + 18 di atas floor yang tidak masuk
  watchlist (mis. Sentora Curator $2,76 Miliar, Polymarket International).
- Tidak diranking di luar watchlist: CEX (42 pre-token), nama berversi (11, pool dari
  protokol lain), dan bridge / staking receipt / wrapper (Bridge, Canonical Bridge,
  Cross Chain Bridge, Liquid Staking, Liquid Restaking, Restaked BTC, Stablecoin
  Wrapper, Anchor BTC, Decentralized BTC) — itu klaim atas aset yang sudah ada,
  bukan protokol yang meluncurkan token. Dua protokol watchlist yang kategorinya
  "Staking Pool" (Reti Pooling, rank 51) dan "Stablecoin Wrapper" (Saturn, rank 32)
  tetap diranking karena watchlist ditambahkan tanpa syarat (coverage tidak digambl).
- Live-token dipisah: 24 teratas menurut market cap, ditampilkan dengan nilai pasar,
  tidak pernah mengambil rank pre-token.

Farm plan: 6 langkah per protokol, diturunkan dari record-nya sendiri (kategori →
aksi, TVL → modal $50/$100/$150/$250, umur → hold 60/45/30 hari). Dua langkah
spesifik-kategori (aksi utama + aksi kedua), masing-masing menyebut biaya dan waktu.

Top 5: #1 Steakhouse Financial $599.143.174 · #2 Sentora Curator $561.979.510 ·
#3 Gauntlet $362.360.526 · #4 Veda $337.830.857 · #5 USDD $222.535.979.

## Dashboard

Tema gelap khas (ink gelap + aksen amber), bukan tema hijau-terang starter:

- Header + lede berisi fakta (197 diranking, 40 watchlist, 157 di luar, 24 live,
  top $599.143.174, floor $50.000.000).
- Spotlight top five (kartu, bisa diklik → detail).
- Board: search, filter kategori, sort (implied value / TVL / 7d / umur), tab
  Pre-token (197) / Live token (24). Bar nilai relatif terhadap #1. Badge
  "● Watchlist" pada baris watchlist.
- Detail view (dialog, dibuka klik atau hash `#p=<slug>`): rincian pembangunan nilai
  (TVL × kategori, growth, umur, chains) **dihitung ulang di halaman** dan harus
  cocok dengan board.json (ditampilkan ✓/✗), farm plan 6 langkah, record snapshot.
- Panel model: rumus + tabel semua kategori dan multiple-nya + penjelasan.
- Sandbox "Try the model": 3 slider (growth weight, category scale, maturity floor)
  yang me-ranking ulang top 10 secara live. Board utama selalu memakai model resmi.
- Hash routing (`#q=`, `#category=`, `#sort=`, `#p=`) sehingga setiap view adalah link.

## Verifikasi (semua lolos)

- **Determinisme**: main.ts dijalankan 2× ke direktori berbeda → `diff -r` identik
  (byte-identical), termasuk dengan screenshot asli.
- **Gate 7 cek** (diverifikasi manual, karena `check` kit tidak menjalankan gate;
  gate dijalankan server saat grading):
  1. dashboard_files — 3 file di dashboard/ ✓
  2. board_file — board.json 197 baris ✓
  3. sorted_by_value — implied menurun, rank 1..197 ✓
  4. coverage — 40/40 watchlist ada ✓
  5. farm_steps — semua 6 langkah, 20–600 karakter ✓
  6. screenshots — 3 gambar, masing-masing ≤ 512 KiB ✓
  7. dossier_matches — dossier.json byte-for-byte sama dengan yang ditulis
     `buildDossier` dari /output yang sama (dicek via skrip `/tmp/tr-dossier-check.mjs`) ✓
- **board.json vs data.js**: 0 mismatch implied value (197/197).
- **Dossier**: 724.856 byte (cap 1,5 MiB), teks 37.067 byte (cap 65.536), 3 gambar.
- **Kit check** (`check --kit … --repo … --worktree`): 4 passed (competition_open,
  snapshot, license_osi, entrypoint), 1 failed (transcripts_present — wajar, bundle
  dibuat parent), 14 skipped (butuh bundle), 5 at submission (repo_public,
  repo_owner, repo_created_after_open, commit_in_repo, duplicate_snapshot — butuh
  GitHub + submit).
- **Render browser** (chrome-headless-shell 1255, HTTP lokal): 3 screenshot
  diverifikasi visual — board render penuh, detail dialog terbuka dengan rincian
  nilai yang cocok (✓), filter kategori "Risk Curators" menampilkan "34 of 197
  shown". DOM dump: 197 baris tabel ter-render, panel model + tabel 30 kategori
  ada, sandbox top 10 terisi dan cocok dengan board (default).
- **Kuota** (cek 2026-11-16 ~15:15 WIB via `GET /api/competitions/token-radar-01/quota`,
  header `x-api-key`): entries_made 0, day cap 5 left 5 (reset 2026-11-17T00:00Z),
  total max 10 left 10, hard limit 20 left 20, **can_submit: true**. Tidak ada fee.
- **thinking_revised**: main.ts ditulis lalu diedit lagi (revisi model + beyond_size),
  dan lib/model.ts diedit berkali-kali — entrypoint dan kode yang dijalankannya
  mengambil konten final dari ≥2 pesan write/edit. (Bundle dibuat parent; parent
  harus memastikan ≥5 turn asisten dan usage row ada.)

## Dua bug yang ditemukan & diperbaiki saat build

1. `parseSnapshot` lupa menyertakan `mcap_usd` → `isPreToken` selalu false (undefined
   ≠ null) → board hanya 40 baris (watchlist saja). Diperbaiki: `mcap_usd` kini
   diparse (angka hingga → null). Board jadi 289 baris.
2. Board 289 baris didominasi wrapped/staked/bridged raksasa di puncak
   (#1 Binance staked ETH $1,16 M, #2 Coinbase Bridge, #3 WBTC) — bukan peluncuran
   token sungguhan. Diperbaiki: kategori bridge/receipt/wrapper dikeluarkan dari
   `isRankable` (dan dari tabel multiple), watchlist tetap ditambahkan tanpa syarat.
   Board jadi 197 baris dengan puncak protokol asli (Steakhouse, Sentora, Gauntlet…).

## Penilaian jujur peluang top 10

**Peluang top 10: ~1 dari 5 (20%), top 20: ~1 dari 3.** Alasan:

- Kuat: model lebih diskriminatif dari starter (kategori + growth 0,7 + maturity
  0,55–1,0 + chains), board paling lengkap (197 vs starter 200 tapi 40 di antaranya
  watchlist saja — starter hanya 200 baris dan melewatkan 18 protokol di atas floor
  yang tidak masuk watchlist), farm plan spesifik-kategori dengan biaya/waktu,
  dashboard lengkap (spotlight, filter, sort, detail dengan recompute ✓, panel
  model transparan, sandbox interaktif), semua gate lolos, deterministik.
- Risiko: penilaian pairwise oleh AI judge bersifat subjektif; 8.423 entri di
  kompetisi ini (angka saat board dibaca) dan hanya 10 tempat berbayar — banyak
  entri lain juga akan kuat. Kriteria #2 (value model) dan #3 (farm plan) adalah
  tempat keunggulan ini; kriteria #5 (looks) dibantu tema gelap yang khas tapi
  bukan penentu. Tidak ada skor latihan lokal untuk kalibrasi (kompetisi ini tidak
  punya grade-local), jadi peluang adalah perkiraan, bukan pengukuran.
- Satu kelemahan yang disadari: tabel 197 baris membuat panel model + sandbox
  berada jauh di bawah (harus scroll panjang). Judge membaca sumber dashboard
  lewat dossier text, jadi model tetap terlihat, tapi secara visual panel model
  tidak muncul di 3 screenshot (sesuai aturan: board, detail, filtered).

## Yang masih harus dilakukan parent (bukan bagian tugas ini)

1. **Buat repo GitHub publik** (dibuat setelah 2026-11-14T10:00:00Z) dan push isi
   repo ini. Isi placeholder README: `{owner}` = owner GitHub, `{repo}` = nama repo,
   `{referral_code}` = `0cnt242b`. Set GitHub About: website
   `https://make.fun/bounty/token-radar-01` + topic `makefun`. Tambahkan
   `.makefun/owner.json` berisi `{"wallet": "CrWWNDzTod7N28rLorApVqzcWYJBipbiHEntpiikQX8b"}`
   (wallet A1) kecuali owner GitHub = login GitHub akun.
2. **Git identity**: commit butuh email git user (belum diberikan). Saat push, set
   author/committer ke identitas user; commit lokal belum dibuat (repo ini belum
   ada `.git`) — parent yang init + commit + push.
3. **Bundle transcript**: `node <kit>/cli/makefun.mjs bundle --repo <repo> --out
   <bundle.tar.gz> --mcp none --harness muse-app --harness-version <versi aplikasi
   Muse> --provider <nama> --model <id> --effort default --prompt-file <file prompt
   asli>` — dibuat parent dari sesi ini + sesi parent. (Versi aplikasi Muse masih
   ditunggu dari user; itu juga memblokir bring-the-humans/best-game/aggregator.)
4. **Check dengan bundle**: `node <kit>/cli/makefun.mjs check --kit <kit> --repo <repo>
   --transcripts <bundle.tar.gz>` — harus lolos semua (termasuk thinking_*).
5. **Submit** (sebelum 2026-12-14T10:00:00Z): `node <kit>/cli/makefun.mjs submit
   --competition token-radar-01 --repo-url https://github.com/<owner>/<repo>
   --commit <sha-40> --title "Token Radar" --bundle <bundle.tar.gz>
   --keypair ~/workspace/make-fun/makefun-keypair.json`.
   Re-verifikasi kuota saat submit (saat ini can_submit: true, 5/5 hari ini).
6. Catatan: entry ini TIDAK butuh recording (`makefun record`) — kompetisi bundle.
   Jangan jalankan recording untuk entry ini; bundle sudah cukup.

## Rebuild radar-3 (19 Nov 2026, sesi builder top-level 01:54 WIB)

Motif: analisis pemenang (playbook §11) — entry lama ter-screen out (high 918.133 < garis screen 940.016; rank 4543/12.020, judge 884.902). Rebuild penuh model + dashboard, file ditulis fresh tanpa baca kode lama dulu (kode lama dipindah ke /tmp/tr-old-20261116/ sebagai backup).

**Model radar-3 (fitted, lib/model.ts fresh):** regresi log(mcap) pada 128 protokol live-token di snapshot yang sama; fit pada 106 yang "comparable" (mcap/TVL 0,01–3); 22 di luar scope dikecualikan oleh aturan dan DINAMAI di dashboard (bukan disembunyikan). Huber-robust IRLS (15 iterasi), 5 regressor: log TVL, log(1+growth clamp −60..200%), log umur (null → 730 hari), log jumlah chain. Koefisien: 3,2254 + 0,7002·logTVL + 0,8507·growth + 0,1129·logAge − 0,0862·logChains. **Validasi (dihitung tiap run, tampil di dashboard):** in-sample R² 0,50; LOO (n=106) median error ×3,02, 28% dalam 2×, Spearman 0,62; walk-forward 2024-01-01 (train 38, test 43) R² 0,09, Spearman 0,67, 40% dalam 2×; walk-forward 2024-07-01 (train 46, test 35) R² 0,11, Spearman 0,72, 34% dalam 2×. **Rank ranges dari 200 refits** bootstrap (seed tetap 20261114) — tiap baris menampilkan rentang rank p5–p95 (median lebar 45 rank; #1 (1–3), #2 (1–4)).

**Board:** 198 baris strict pre-token (40/40 watchlist), top #1 Sentora Curator $182.881.960, #2 Steakhouse $166.420.089, #3 Gauntlet $117.831.127, #4 Veda $106.279.525, #5 USDD $95.884.918; median $6.282.484. **Cakupan 758 = 198 + 128 live + 144 excluded no-token + 288 token-recorded tanpa mcap (272 null + 15 nol + 1 negatif: AUTOfinance mcap −$1, dicatat).** Farm plan 6 langkah per protokol, deposit $55–$275 menurut TVL, gas per langkah dari chain pertama, hold 30–60 hari menurut umur; fee total $0,07–$48.

**Dashboard (fresh):** KPI strip (758 · 198 · 40 · top $182.881.960 · LOO ×3,02 · WF Spearman 0,67/0,72), model strip dengan rumus + koefisien literal (main.ts MENOLAK menulis bila angka literal di index.html tidak cocok dengan hasil hitung run itu), spotlight top 5, board sort/search/filter/tab (Pre-token 198 / Live 128 / Not ranked 144), detail dialog dengan recompute nilai di halaman (✓/✗ vs board.json), tabel coverage lengkap. Screenshot baru 1280×1200 (221/285/227 KB): board, detail Sentora Curator, filtered Risk Curators (34).

**Verifikasi (semua lolos):** gate 7 cek direplikasi lokal 9/9 (dashboard_files, board_file, sorted_by_value, coverage, farm_steps, screenshots, dossier_matches byte-for-byte, board vs data.js, coverage sums to 758); determinisme 2 run byte-identical; dossier 1.014.906 byte (cap 1,5 MiB), teks 29.408 byte (cap 65.536, tidak ada yang terpotong); DOM render 198 baris + tab live/excluded + tabel coverage terverifikasi headless.

**Self-grade jujur (0–5 per kriteria rubrik):** (1) working radar 5; (2) value model 5 (fitted + validasi ditampilkan; catatan jujur: akurasi absolut moderat, median error ×3,02 — pasarnya memang noisy); (3) farm plans 4 (terhitung per protokol, tapi aksi masih template kategori); (4) dashboard 5; (5) looks 4. Rata-rata 4,6 — lolos quality gate (kriteria #1 ≥4, tak ada <3, rata-rata ≥3,5). **Estimasi screen-in: ~65–75%** (high lama 918.133 → butuh ≥940.016; rebuild ini menyamai spesifikasi pemenang top-10: fitted + WF/LOO + 200 refits + 758 + costed plans + KPI strip); **top 100 ~30–40%** (juri pairwise noisy). **BELUM submit / commit / push** — parent yang bundle sesi ini + sesi build lama, buat repo, dan submit (mandat user 19 Nov ~02:18: resubmit bila ada versi lebih baik yang lolos gate — versi ini kandidatnya).

## File kerja (bukan bagian entry)

- `/tmp/tr-verify.mjs` — verifikasi board/data.js/dossier.
- `/tmp/tr-dossier-check.mjs` — verifikasi dossier_matches byte-for-byte.
- `/tmp/tr-final/`, `/tmp/tr-final2/` — dua output run terakhir (byte-identical).
- `/tmp/tr-shot-*.png` — screenshot verifikasi (board, detail, filtered, tall).
