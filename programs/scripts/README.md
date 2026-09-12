# Devnet setup scripts

One-time (idempotent) setup for the `sea_invaders` program on devnet. Run
from `programs/` with the project's ts-node runner (already a
dependency via `ts-mocha`):

```
npx ts-node scripts/devnet-init.ts        # or: npm run devnet:init
npx ts-node scripts/create-week-pools.ts  # or: npm run devnet:pools
npx ts-node scripts/smoke-test.ts         # or: npm run devnet:smoke
```

Run in that order: `devnet-init.ts` creates `Config` (and the test SKR
mint + treasury ATA it needs), `create-week-pools.ts` needs `Config` to
exist, and `smoke-test.ts` needs the current week's pool to exist.

## Env vars

- `KEYS_DIR` - default `/mnt/d/dev/keys`. Directory holding
  `admin.json`, `server-authority.json` (both read by all three
  scripts). Never commit this directory or print its contents.
- `ANCHOR_PROVIDER_URL` - default `https://api.devnet.solana.com`.

## What each script does

- **`devnet-init.ts`** - creates the devnet test SKR mint (6 decimals,
  mint authority = the **server authority**, not the admin, so the
  backend faucet can mint without the admin key), the admin's ATA (used
  as the protocol treasury), and calls `initConfig` with the same
  values the test suite uses (`tests/fixtures.ts`'s `configArgs`: 10 SKR
  ticket, 3 attempts/ticket, 9500/2000 bps, the revive ladder, a 7200s
  ebb window, 900s grace, the payout table). Idempotent: if `Config`
  already exists it prints the stored values and exits 0.
- **`create-week-pools.ts`** - computes the current week from the RPC
  clock (`day = floor(blockTime / 86400)`, `week = floor((day + 3) / 7)`)
  and creates `WeekPool(week)` and `WeekPool(week + 1)` if missing
  (payer: admin here; the backend's crank does the same later with the
  server authority - Task 9). Idempotent per week.
- **`smoke-test.ts`** - mints 100 test SKR to an in-memory-only throwaway
  keypair (never written to disk - there is nothing to "delete"
  afterwards), then `createPlayer` + `buyTicket` for it against the
  current week's pool, and asserts `Player.attemptsBought === 3` and
  that the vault balance increased by exactly `9_500_000` (a delta, not
  an absolute value, since the vault is a shared pool - running this
  script more than once in the same week keeps adding to it).

## Deployed devnet addresses

| Name | Value |
|---|---|
| `PROGRAM_ID` | `G1vEN2CY1KfjPia3hD7MALBwseSRUfrcBivxfKKGqset` |
| `SKR_MINT` | `Bk454WdhpYQB2crEQeVNQWWqi33xqFWXELHbi44XkHht` |
| `TREASURY_ATA` | `5uFynZKJc7KbZo7JeKuQTREJnszYvFJicmN81sow5ZQK` |
| `SERVER_AUTHORITY` | `nNQn5MZY799P8PcjwrGMxXEjaSquuifYmhcSYJYK7wH` |
| `ADMIN` (upgrade authority) | `AVHHLGsaChQLKMJSthVhhrQ3rn2hSgeQUBRkmobUQBNm` |

Secret keys for `ADMIN` and `SERVER_AUTHORITY` live only under
`/mnt/d/dev/keys/` (`admin.json`, `server-authority.json`,
`program-keypair.json`) - never committed, never printed.

## Deploying / redeploying the program

`Anchor.toml`'s `[provider]` stays on `localnet` so `anchor test` keeps
starting a local validator instead of running against devnet. Deploy (or
upgrade) to devnet with an explicit override instead:

```
anchor build --arch v1
anchor deploy --provider.cluster devnet --provider.wallet /mnt/d/dev/keys/admin.json
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
