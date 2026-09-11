import { expect } from "chai";
import { setup, warpTo } from "./helpers";

describe("harness", () => {
  it("funds actors, mints the test token and controls the clock", async () => {
    const ctx = await setup();
    await ctx.mintTo(ctx.alice.publicKey, 25_000_000n);
    expect(await ctx.tokenBalance(ctx.alice.publicKey)).to.equal(25_000_000n);
    expect(await ctx.tokenBalance(ctx.bob.publicKey)).to.equal(0n);
    warpTo(ctx, 1_800_000_000); // 2027-01-15T08:00:00Z
    expect(ctx.now()).to.equal(1_800_000_000);
    warpTo(ctx, 1_800_086_400);
    expect(ctx.now()).to.equal(1_800_086_400);
  });
});
