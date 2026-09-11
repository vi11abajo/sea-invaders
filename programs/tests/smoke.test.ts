import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import { Ctx, setup, warpTo } from "./helpers";

describe("harness", () => {
  // A single shared LiteSVM instance for the whole file: creating a second
  // `LiteSVM` instance in the same process reliably crashes the native
  // addon (`std::bad_alloc`) partway through the associated-token-account
  // creation transaction in litesvm@0.8.0 - reproduced independently with
  // standalone scripts outside mocha, confirmed unrelated to Ctx/helpers
  // logic. One shared instance is also the idiomatic litesvm/bankrun test
  // pattern (`before`/`beforeEach`, not a fresh VM per assertion).
  let ctx: Ctx;

  before(async () => {
    ctx = await setup();
  });

  it("funds actors, mints the test token and controls the clock", async () => {
    await ctx.mintTo(ctx.alice.publicKey, 25_000_000n);
    expect(await ctx.tokenBalance(ctx.alice.publicKey)).to.equal(25_000_000n);
    expect(await ctx.tokenBalance(ctx.bob.publicKey)).to.equal(0n);
    warpTo(ctx, 1_800_000_000); // 2027-01-15T08:00:00Z
    expect(ctx.now()).to.equal(1_800_000_000);
    warpTo(ctx, 1_800_086_400);
    expect(ctx.now()).to.equal(1_800_086_400);
  });

  it("builds, sends and fetches through the Anchor client bound to the LiteSVM provider", async () => {
    const [player] = PublicKey.findProgramAddressSync(
      [Buffer.from("player"), ctx.alice.publicKey.toBuffer()],
      ctx.programId
    );

    const createIx = await ctx.program.methods
      .createPlayer()
      .accountsPartial({ wallet: ctx.alice.publicKey, player })
      .instruction();
    await ctx.send([createIx], [ctx.alice]);

    // Exercises the LiteSVM-backed provider's `getAccountInfo` (via the
    // generated account coder), not just `ctx.tokenBalance`'s own decoding.
    const playerAccount = await ctx.program.account.player.fetch(player);
    expect(playerAccount.attemptsBought).to.equal(0);
    expect(playerAccount.wallet.equals(ctx.alice.publicKey)).to.equal(true);

    // The player PDA is seeded by wallet, so a second `create_player` for
    // the same wallet hits the `init` constraint's "account already in
    // use" failure. litesvm@0.8.0 surfaces this particular system-program
    // error as a bare numeric code with no logs (confirmed by inspection:
    // `result.err().toString()` returns just `"6"`, not descriptive text),
    // so this only asserts that `send`'s error path actually rejects,
    // rather than matching specific wording.
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
    expect(thrown!.message).to.not.equal("");
  });
});
