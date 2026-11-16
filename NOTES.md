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

## File kerja (bukan bagian entry)

- `/tmp/tr-verify.mjs` — verifikasi board/data.js/dossier.
- `/tmp/tr-dossier-check.mjs` — verifikasi dossier_matches byte-for-byte.
- `/tmp/tr-final/`, `/tmp/tr-final2/` — dua output run terakhir (byte-identical).
- `/tmp/tr-shot-*.png` — screenshot verifikasi (board, detail, filtered, tall).
