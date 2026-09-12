import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import { Ctx, setup, warpTo } from "./helpers";
import { initConfig } from "./fixtures";

describe("harness", () => {
  // One `ctx` for the whole file - `admin`/`server`/`mint`/`treasury` are
  // the process-wide shared values (see helpers.ts), only `alice`/`bob` are
  // fresh. `initConfig` is idempotent (see fixtures.ts), so calling it here
  // makes this file order-independent: it performs the real `init_config`
  // if no other file has yet, or just confirms the existing config matches
  // this `ctx` otherwise. Either way, `config` exists and is owned by
  // `ctx.admin` by the time `warpTo` below (an admin-gated on-chain
  // instruction, unlike the Task 1 LiteSVM harness's direct VM-clock write)
  // runs.
  let ctx: Ctx;

  before(async () => {
    ctx = await setup();
    await initConfig(ctx);
  });

  it("funds actors, mints the test token and controls the clock", async () => {
    await ctx.mintTo(ctx.alice.publicKey, 25_000_000n);
    expect(await ctx.tokenBalance(ctx.alice.publicKey)).to.equal(25_000_000n);
    expect(await ctx.tokenBalance(ctx.bob.publicKey)).to.equal(0n);
    await warpTo(ctx, 1_800_000_000); // 2027-01-15T08:00:00Z
    expect(await ctx.now()).to.equal(1_800_000_000);
    await warpTo(ctx, 1_800_086_400);
    expect(await ctx.now()).to.equal(1_800_086_400);
  });

  it("builds, sends and fetches through the Anchor client bound to the validator", async () => {
    const [player] = PublicKey.findProgramAddressSync(
      [Buffer.from("player"), ctx.alice.publicKey.toBuffer()],
      ctx.programId
    );

    const createIx = await ctx.program.methods
      .createPlayer()
      .accountsPartial({ wallet: ctx.alice.publicKey, player })
      .instruction();
    await ctx.send([createIx], [ctx.alice]);

    // Exercises the validator-backed provider's `getAccountInfo` (via the
    // generated account coder), not just `ctx.tokenBalance`'s own decoding.
    const playerAccount = await ctx.program.account.player.fetch(player);
    expect(playerAccount.attemptsBought).to.equal(0);
    expect(playerAccount.wallet.equals(ctx.alice.publicKey)).to.equal(true);

    // The player PDA is seeded by wallet, so a second `create_player` for
    // the same wallet hits the `init` constraint's system-program "already
    // in use" failure - unlike litesvm@0.8.0, which surfaced this as a bare
    // numeric code with no logs, the real validator's preflight simulation
    // returns the descriptive log line, so this can assert on it directly.
    const recreateIx = await ctx.program.methods
      .createPlayer()
      .accountsPartial({ wallet: ctx.alice.publicKey, player })
      .instruction();
    let thrown: Error | undefined;
    try {
      await ctx.send([recreateIx], [ctx.alice]);
    } catch (err) {
      thrown = err as Error;
    }
    expect(thrown).to.not.equal(undefined);
    expect(thrown!.message).to.contain("already in use");
  });
});
