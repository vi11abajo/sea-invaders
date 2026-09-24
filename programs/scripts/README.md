# Devnet setup scripts

One-time (idempotent) setup for the `sea_invaders` program on devnet. Run
from `programs/` with the project's ts-node runner (a devDependency):

```
export KEYS_DIR=<your keys dir>           # required, see "Env vars" below
npx ts-node scripts/devnet-init.ts        # or: npm run devnet:init
npx ts-node scripts/create-week-pools.ts  # or: npm run devnet:pools
npx ts-node scripts/smoke-test.ts         # or: npm run devnet:smoke
npx ts-node scripts/init-catalog.ts       # or: npm run devnet:catalog
npx ts-node scripts/set-prices.ts         # or: npm run devnet:prices
```

Run in that order: `devnet-init.ts` creates `Config` (and the test SKR
mint + treasury ATA it needs), `create-week-pools.ts` needs `Config` to
exist, and `smoke-test.ts` needs the current week's pool to exist.
`init-catalog.ts` only needs `Config` (its admin signs the catalog).

## Env vars

- `KEYS_DIR` - required, no default: `KEYS_DIR=<your keys dir>`, the
  directory holding `admin.json` and `server-authority.json`
  (`create-week-pools.ts`, `init-catalog.ts` and `set-prices.ts` read
  only `admin.json`). Every script stops with a clear error when it is
  unset. Never commit this directory or print its contents.
- `ANCHOR_PROVIDER_URL` - default `https://api.devnet.solana.com`.

All five scripts share their bootstrap (`loadKeypair`, `configPda`,
`weekPda`, `loadProgram`) via `common.ts`; it is not run directly.

## What each script does

- **`devnet-init.ts`** - creates the devnet test SKR mint (6 decimals,
  mint authority = the **server authority**, not the admin, so the
  backend faucet can mint without the admin key), the admin's ATA (used
  as the protocol treasury), and calls `initConfig` with the same
  values the test suite uses (`tests/fixtures.ts`'s `configArgs`: 10 SKR
  ticket, 3 attempts/ticket, 9500/2000 bps, the revive ladder, a 7200s
  ebb window, 900s grace, the payout table). Idempotent: if `Config`
  already exists it prints the stored values and exits 0. The ladder it
  writes (25..120 SKR) was later lowered to 5..24 SKR by `set-prices.ts`;
  that is what devnet holds today.
- **`create-week-pools.ts`** - computes the current week from the RPC
  clock (`day = floor(blockTime / 86400)`, `week = floor((day + 3) / 7)`)
  and creates `WeekPool(week)` and `WeekPool(week + 1)` if missing
  (payer: admin here; the backend's crank does the same later with the
  server authority). Idempotent per week.
- **`smoke-test.ts`** - mints 100 test SKR to an in-memory-only throwaway
  keypair (never written to disk - there is nothing to "delete"
  afterwards), then `createPlayer` + `buyTicket` for it against the
  current week's pool, and asserts `Player.attemptsBought === 3` and
  that the vault balance increased by exactly `9_500_000` (a delta, not
  an absolute value, since the vault is a shared pool - running this
  script more than once in the same week keeps adding to it).
- **`init-catalog.ts`** - creates the `Catalog` PDA with the eighteen shop
  items, all on sale (ids 0-2 the champions Azul, Krang, Poseidon at 56,
  111, 166 SKR and ids 15-17 Noob, Coraluna, Shoupe at the same three
  prices; ids 3-6 the tint skins Lime 25, Lilac 25, Ember 35, Abyss 50
  SKR; ids 7-14 the drawn skins, 35 SKR each and 50 for Matrix and
  Sharingan) and reads it back. Idempotent: an up-to-date catalog is printed and left alone; a
  different one is reported (exit 1) unless the script runs with
  `--update`, which calls `setCatalog`. `setCatalog` replaces the whole
  list, so the script always sends every item.

  **Changing a shop price:** the `PRICES_SKR` table at the top of
  `init-catalog.ts` (item id -> whole SKR) is the only place a shop price
  is set - no price lives in `core/`, `backend/` or `mobile/`, which all
  read the chain. Edit the row, then run
  `npx ts-node scripts/init-catalog.ts --update` with the admin key; the
  backend serves the new price within its 60 s catalogue cache. Adding an
  item touches every one of these: a row in both `PRICES_SKR` and `KIND`
  in `init-catalog.ts` (the script refuses to send when their ids
  differ); `core/src/catalogue.ts`'s name and selector tables
  (`VARIANT_NAMES` and `VARIANT_ITEM_IDS` for a champion, `SKIN_NAMES` and
  `SKIN_ITEM_IDS` for a look); the app's look table in
  `mobile/src/game/looks.ts` (`CHAMPION_LOOK` or `SKIN_LOOK`) and its
  glow accent in `mobile/src/shop/tints.ts` (`ITEM_TINT`); and, for a
  drawn look, its `<slug>-front.png` / `<slug>-ooff.png` pair in
  `mobile/assets/sprites/octopi/`, made by `tools/octopi-sprites.py`
  (whose `SLUGS` table needs the new file stem). The catalogue holds at
  most 64 rows.
- **`set-prices.ts`** - changes the ticket price and the Tide's revive
  ladder in `Config` (`updateConfig`, every other field re-sent unchanged
  from the chain). Edit `TICKET_SKR`/`LADDER_SKR` at the top and run it;
  idempotent when the stored prices already match. Shop item prices are
  changed through `init-catalog.ts --update` instead.

## Deployed devnet addresses

| Name | Value |
|---|---|
| `PROGRAM_ID` | `G1vEN2CY1KfjPia3hD7MALBwseSRUfrcBivxfKKGqset` |
| `SKR_MINT` | `Bk454WdhpYQB2crEQeVNQWWqi33xqFWXELHbi44XkHht` |
| `TREASURY_ATA` | `5uFynZKJc7KbZo7JeKuQTREJnszYvFJicmN81sow5ZQK` |
| `SERVER_AUTHORITY` | `nNQn5MZY799P8PcjwrGMxXEjaSquuifYmhcSYJYK7wH` |
| `ADMIN` (upgrade authority) | `AVHHLGsaChQLKMJSthVhhrQ3rn2hSgeQUBRkmobUQBNm` |
| `CATALOG` (PDA `["catalog", "v2"]`) | `5LnJUyvurh5Sj9MMtaKCrsmUyhSHyzJoec4ecZz8Eefj` |

The 16-row `Catalog` at the old single-seed PDA `["catalog"]`
(`HeJYiaXojsC4beTYqnoPH6Fkyu9afHuVbC5MMTh27kUx`) is abandoned on devnet
since 2026-09-23 - its layout cannot hold the grown, 64-row `Catalog`, so
the versioned seed moved the account rather than migrating it in place.

Secret keys for `ADMIN` and `SERVER_AUTHORITY` live only in your keys
directory (`admin.json`, `server-authority.json`,
`program-keypair.json`) - never committed, never printed.

## Deploying / redeploying the program

`Anchor.toml`'s `[provider]` stays on `localnet` so `anchor test` keeps
starting a local validator instead of running against devnet. Deploy (or
upgrade) to devnet with an explicit override instead:

```
anchor build --arch v1
anchor deploy --provider.cluster devnet --provider.wallet "$KEYS_DIR/admin.json"
solana program show G1vEN2CY1KfjPia3hD7MALBwseSRUfrcBivxfKKGqset --url devnet
```

`--arch v1` matters: the default `anchor build` target (`v3`) is not
what devnet currently runs. Before deploying, confirm the built IDL
excludes the test-only `set_test_clock` instruction (compiled in only
under the `test-clock` cargo feature, which a plain `anchor build` does
not enable):

```
grep -c set_test_clock target/idl/sea_invaders.json   # must print 0
```
