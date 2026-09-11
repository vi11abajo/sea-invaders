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
    const [counter] = PublicKey.findProgramAddressSync(
      [Buffer.from("counter")],
      ctx.programId
    );

    const initIx = await ctx.program.methods
      .initialize()
      .accountsPartial({ payer: ctx.alice.publicKey, counter })
      .instruction();
    await ctx.send([initIx], [ctx.alice]);

    // Exercises the LiteSVM-backed provider's `getAccountInfo` (via the
    // generated account coder), not just `ctx.tokenBalance`'s own decoding.
    const counterAccount = await ctx.program.account.counter.fetch(counter);
    expect(counterAccount.count.toString()).to.equal("0");
    expect(counterAccount.authority.equals(ctx.alice.publicKey)).to.equal(true);

    // The counter PDA has no per-payer seed, so a second `initialize` hits
    // the `init` constraint's "account already in use" failure - proving
    // `send`'s error path surfaces a real program log, not just a generic
    // rejection.
    const reinitIx = await ctx.program.methods
      .initialize()
      .accountsPartial({ payer: ctx.bob.publicKey, counter })
      .instruction();
    let thrown: Error | undefined;
    try {
      await ctx.send([reinitIx], [ctx.bob]);
    } catch (err) {
      thrown = err as Error;
    }
    expect(thrown).to.not.equal(undefined);
    expect(thrown!.message).to.include("already in use");
  });
});
