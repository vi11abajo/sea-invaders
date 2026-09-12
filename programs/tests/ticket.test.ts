import { expect } from "chai";
import { Ctx, setup, warpTo } from "./helpers";
import {
  buyTicket,
  createPlayer,
  createWeekPool,
  fetchPlayer,
  initConfig,
  weekPda,
} from "./fixtures";

// 1_788_739_200 = 2026-09-07T00:00:00Z, a Monday (see tests/fixtures.ts /
// src/time.rs for why this replaces the brief's original constant, which
// was a Wednesday).
const T0 = 1_788_739_200;
const DAY = 86400;
const dayOf = (ts: number) => Math.floor(ts / DAY);
const weekOf = (d: number) => Math.floor((d + 3) / 7);

// config.test.ts's own "create_week_pool" test already creates the pool
// for weekOf(dayOf(T0)) on this shared validator (see helpers.ts - `config`
// and every week pool are singletons for the life of the `anchor test` run,
// not per-file), and every `it` below calls bootstrap() again with a fresh
// `alice`/`bob` - so each call must land on a week nobody has used yet, or
// `createWeekPool` fails with "already in use". `bootstrapCount` gives each
// call its own week, starting one full week after config.test.ts's.
let bootstrapCount = 0;

async function bootstrap() {
  const ctx = await setup();
  await initConfig(ctx);
  const start = T0 + (bootstrapCount + 1) * 7 * DAY;
  bootstrapCount += 1;
  await warpTo(ctx, start + 3600);
  // The shared validator's clock only moves forward via warpTo and other
  // files may already have warped it past `start + 3600` by the time this
  // runs - deriving "today" from the actual on-chain clock right after our
  // own warp (rather than assuming it landed exactly on `start + 3600`)
  // keeps this test self-contained.
  const today = dayOf(await ctx.now());
  const week = weekOf(today);
  await createWeekPool(ctx, week);
  await createPlayer(ctx, ctx.alice);
  await ctx.mintTo(ctx.alice.publicKey, 100_000_000n);
  return { ctx, week, today, start };
}

describe("buy_ticket", () => {
  it("splits 10 SKR into 9.5 pool and 0.5 treasury and grants 3 attempts", async () => {
    const { ctx, week, today } = await bootstrap();
    await buyTicket(ctx, ctx.alice, week);

    expect(await ctx.tokenBalance(ctx.alice.publicKey)).to.equal(90_000_000n);
    expect(await ctx.tokenBalance(weekPda(ctx.programId, week))).to.equal(
      9_500_000n
    );
    // `ctx.treasury` is `admin`'s ATA (see helpers.ts) and this is the
    // first ticket ever bought in the whole `anchor test` run, so it holds
    // exactly this one ticket's treasury share.
    expect(await ctx.tokenBalance(ctx.admin.publicKey)).to.equal(500_000n);

    const p = await fetchPlayer(ctx, ctx.alice);
    expect(p.attemptsBought).to.equal(3);
    expect(p.ticketDay).to.equal(today);
  });

  it("a second ticket the same day adds 3 more; a ticket the next day rolls the day over", async () => {
    const { ctx, week, today, start } = await bootstrap();
    await buyTicket(ctx, ctx.alice, week);
    await buyTicket(ctx, ctx.alice, week);
    expect((await fetchPlayer(ctx, ctx.alice)).attemptsBought).to.equal(6);

    await warpTo(ctx, start + DAY + 60);
    await buyTicket(ctx, ctx.alice, week);
    const p = await fetchPlayer(ctx, ctx.alice);
    expect(p.attemptsBought).to.equal(3);
    expect(p.ticketDay).to.equal(today + 1);
    expect(p.prevTicketDay).to.equal(today);
  });

  it("refuses the wrong week pool, an insufficient balance and a paused program", async () => {
    const { ctx, week } = await bootstrap();

    // Wrong week pool: a real, existing pool - just not the one for today.
    const wrongWeek = week + 1;
    await createWeekPool(ctx, wrongWeek);
    let wrongPoolErr = "";
    try {
      await buyTicket(ctx, ctx.alice, wrongWeek);
    } catch (e: any) {
      wrongPoolErr = e.message;
    }
    expect(wrongPoolErr).to.contain("WrongWeekPool");

    // Insufficient balance: bob has a player and a token account, but it
    // holds zero SKR.
    await createPlayer(ctx, ctx.bob);
    await ctx.mintTo(ctx.bob.publicKey, 0n);
    let insufficientErr = "";
    try {
      await buyTicket(ctx, ctx.bob, week);
    } catch (e: any) {
      insufficientErr = e.message;
    }
    expect(insufficientErr.toLowerCase()).to.contain("insufficient funds");

    // Paused program: `config` is a singleton shared with every other test
    // file/case on this validator, so it must be un-paused again no matter
    // how the assertion below turns out.
    let pausedErr = "";
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
        await buyTicket(ctx, ctx.alice, week);
      } catch (e: any) {
        pausedErr = e.message;
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
    expect(pausedErr).to.contain("Paused");
  });
});
