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
