# sea_invaders program

## Building

Tests need the `test-clock` feature (see `src/time.rs`), which compiles in
the admin-only `set_test_clock` instruction the test harness uses to warp
the on-chain clock. A deployable artifact must never carry it.

```sh
# Build for the tests, then run them against the validator `anchor test`
# starts (Anchor.toml has no skip_local_validator line, so it defaults to
# false):
anchor build --arch v1 -- --features test-clock
anchor test --skip-build --validator legacy

# Build the production artifact (no test-clock, no set_test_clock in the IDL):
anchor build --arch v1
```

`--arch v1` matches the SBPF architecture already deployed on devnet/localnet.
Cargo feature flags for `anchor build` go after `--`, forwarded straight to
`cargo build-sbf` (verified with `anchor build --help` on Anchor 1.2.0).

`--validator legacy` is required: this Anchor 1.2.0 build (the otter-sec
fork, `avm install 1.2.0`) defaults `anchor test` to starting `surfpool`
instead of `solana-test-validator`, and fails outright if `surfpool` isn't
on `PATH`. `--validator legacy` switches it to the classic
`solana-test-validator` (verified with `anchor test --help`); there is no
persistent Anchor.toml key for this, it must be passed on every `anchor
test` invocation. `anchor test` also needs a wallet keypair at the path in
`[provider] wallet` (`~/.config/solana/id.json`); `solana-keygen new` if
none exists yet - it only funds itself from the local validator's faucet
and is unrelated to any real signing key.

## `init_config` requires the program's upgrade authority

`init_config` (`src/instructions/admin.rs`) constrains its `admin` signer to
match the program's own `ProgramData.upgrade_authority_address` - the
standard Anchor upgrade-authority pattern - so the singleton `config` PDA
can only ever be claimed by whoever controls the deployed program, closing
the window between `anchor deploy` and running the init script. On devnet
this is `admin.json` under `/mnt/d/dev/keys` (verified: `solana program
show <PROGRAM_ID> --url devnet` prints `Authority:
AVHHLGsaChQLKMJSthVhhrQ3rn2hSgeQUBRkmobUQBNm`).

This requires `anchor test`'s local validator to load the workspace program
as upgradeable with `[provider].wallet` as the authority, instead of the
default immutable genesis load. **`Anchor.toml` sets `[test] upgradeable =
true` for exactly this reason - without it, `solana-test-validator` boots
the program via `--bpf-program` (upgrades disabled, `ProgramData` account
present but with no real authority) and every `init_config` call, including
the test harness's own, fails with `NotUpgradeAuthority`.** Verified by
running with the key removed: all `config`/`ticket`/`record`/`settle`/
`harness` tests fail that way; restoring it returns to 23 passing.
`tests/helpers.ts`'s `setup()` therefore makes `admin` the provider wallet
keypair (read from the `ANCHOR_WALLET` env var `anchor test` sets), not a
random one.

## Keeping the committed IDL in sync

`backend/src/chain/idl/sea_invaders.json` is a committed copy of the
production IDL (`anchor build --arch v1`, no feature flags); the backend
loads it at runtime instead of building the program itself. **Refresh that
copy after any change to the program** (instructions, accounts, types -
anything that changes the IDL). The `anchor` CI workflow's "Production
build" step rebuilds the production artifact and fails if the freshly
built `target/idl/sea_invaders.json` differs from the committed copy, or
if `set_test_clock` (a test-only instruction, see above) appears in it.
