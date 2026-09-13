import { expect } from "chai";
import { Ctx, setup, warpTo } from "./helpers";
import {
  createPlayer,
  createWeekPool,
  fetchPlayer,
  getEvent,
  initConfig,
  revive,
  weekPda,
} from "./fixtures";

const DAY = 86400;
const WEEK = 7 * DAY;
const dayOf = (ts: number) => Math.floor(ts / DAY);
const weekOf = (d: number) => Math.floor((d + 3) / 7);

// 1_788_739_200 = 2026-09-07T00:00:00Z, a Monday (see tests/fixtures.ts /
// src/time.rs). This file gets its own +24-weeks-forward slice of the
// shared validator's timeline (see helpers.ts), past shop.test.ts's own
// +20 slice and every earlier file's range (config.test.ts: week_of(T0);
// ticket.test.ts: +1..3; record.test.ts: +6..8; settle.test.ts: +12..19).
const T0 = 1_788_739_200;
const BASE = T0 + 24 * WEEK;

// 25, 30, 40, 50, 60, 75, 95, 120 SKR in base units (design §1's Tide
// ladder, same values as fixtures.ts's LADDER).
const LADDER = [25, 30, 40, 50, 60, 75, 95, 120].map((s) => s * 1_000_000);
const EBB_SECONDS = 7200; // Config.ebb_seconds, from configArgs() in fixtures.ts

// Mirrors instructions::ticket::split(price, purchase_pool_bps) exactly
// (purchase_pool_bps = 2000, see configArgs()): floor(price * bps / 10000)
// to the pool, the remainder to the treasury.
function splitShares(price: number): { pool: number; treasury: number } {
  const pool = Math.floor((price * 2000) / 10000);
  return { pool, treasury: price - pool };
}

describe("revive (the Tide)", () => {
  let ctx: Ctx;
  let week: number;

  before(async () => {
    ctx = await setup();
    await initConfig(ctx);
    await warpTo(ctx, BASE + 3600);
    week = weekOf(dayOf(await ctx.now()));
    await createWeekPool(ctx, week);
    await createPlayer(ctx, ctx.alice);
    await createPlayer(ctx, ctx.bob);
    await ctx.mintTo(ctx.alice.publicKey, 1_000_000_000n); // 1000 SKR
    await ctx.mintTo(ctx.bob.publicKey, 1_000_000_000n);
  });

  it("walks the ladder up one step per revive, paying ladder[tide] each time, and caps at step 7", async () => {
    // No warp between calls: `now` (the test-clock override) stays fixed,
    // so every one of these 8 revives sees elapsed_steps == 0 and only the
    // rising `tide` moves the price along the ladder.
    const now = await ctx.now();
    for (let step = 0; step < 8; step++) {
      const treasuryBefore = await ctx.tokenBalance(ctx.admin.publicKey);
      const poolBefore = await ctx.tokenBalance(weekPda(ctx.programId, week));
      const sig = await revive(ctx, ctx.alice, week);

      const price = LADDER[step];
      const { pool, treasury } = splitShares(price);
      expect(await ctx.tokenBalance(ctx.admin.publicKey)).to.equal(
        treasuryBefore + BigInt(treasury)
      );
      expect(await ctx.tokenBalance(weekPda(ctx.programId, week))).to.equal(
        poolBefore + BigInt(pool)
      );

      const p = await fetchPlayer(ctx, ctx.alice);
      const expectedTide = Math.min(step + 1, 7);
      expect(p.tide).to.equal(expectedTide);
      // `tide_at` always moves to "now" on a successful revive, even when
      // (as here) the price stays put because no time has elapsed.
      expect(p.tideAt.toNumber()).to.equal(now);

      if (step === 0) {
        // The backend reads this event to confirm and cache the revive -
        // assert its payload matches what was actually charged and stored.
        const event = await getEvent(ctx, sig, "revived");
        expect(event.wallet.equals(ctx.alice.publicKey)).to.be.true;
        expect(event.price.toString()).to.equal(price.toString());
        expect(event.tide).to.equal(expectedTide);
        expect(event.tideAt.toNumber()).to.equal(now);
      }
    }
  });

  it("ebbs one step after exactly one ebb window (7200 s)", async () => {
    const before = await fetchPlayer(ctx, ctx.alice);
    expect(before.tide).to.equal(7); // left at the cap by the previous test
    const tideAt = before.tideAt.toNumber();

    await warpTo(ctx, tideAt + EBB_SECONDS);
    const treasuryBefore = await ctx.tokenBalance(ctx.admin.publicKey);
    await revive(ctx, ctx.alice, week);

    // effective = 7 - min(7, 1) = 6 -> price = ladder[6]; new tide =
    // min(6 + 1, 7) = 7 (still at the cap).
    const { treasury } = splitShares(LADDER[6]);
    expect(await ctx.tokenBalance(ctx.admin.publicKey)).to.equal(
      treasuryBefore + BigInt(treasury)
    );
    const after = await fetchPlayer(ctx, ctx.alice);
    expect(after.tide).to.equal(7);
  });

  it("ebbs two steps after two full ebb windows (14400 s)", async () => {
    // bob starts fresh (tide 0, tide_at 0) and rises to tide 3 with three
    // immediate revives (no time passes between them).
    for (let i = 0; i < 3; i++) {
      await revive(ctx, ctx.bob, week);
    }
    const mid = await fetchPlayer(ctx, ctx.bob);
    expect(mid.tide).to.equal(3);
    const tideAt = mid.tideAt.toNumber();

    await warpTo(ctx, tideAt + 2 * EBB_SECONDS);
    const treasuryBefore = await ctx.tokenBalance(ctx.admin.publicKey);
    await revive(ctx, ctx.bob, week);

    // effective = 3 - min(3, 2) = 1 -> price = ladder[1]; new tide =
    // min(1 + 1, 7) = 2.
    const { treasury } = splitShares(LADDER[1]);
    expect(await ctx.tokenBalance(ctx.admin.publicKey)).to.equal(
      treasuryBefore + BigInt(treasury)
    );
    const after = await fetchPlayer(ctx, ctx.bob);
    expect(after.tide).to.equal(2);
  });

  it("refuses a revive while the program is paused", async () => {
    let err = "";
    try {
      await ctx.send(
        [
          await ctx.program.methods
            .setPaused(true)
            .accounts({ admin: ctx.admin.publicKey })
            .instruction(),
        ],
        [ctx.admin]
      );
      try {
        await revive(ctx, ctx.alice, week);
      } catch (e: any) {
        err = e.message;
      }
    } finally {
      await ctx.send(
        [
          await ctx.program.methods
            .setPaused(false)
            .accounts({ admin: ctx.admin.publicKey })
            .instruction(),
        ],
        [ctx.admin]
      );
    }
    expect(err).to.contain("Paused");
  });
});
