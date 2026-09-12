import { expect } from "chai";
import { Keypair } from "@solana/web3.js";
import { airdrop, Ctx, setup, warpTo } from "./helpers";
import {
  buyTicket,
  createPlayer,
  createWeekPool,
  fetchPlayer,
  fetchWeekPool,
  initConfig,
  submit,
  submitIx,
} from "./fixtures";

const LAMPORTS_PER_SOL = 1_000_000_000;
const DAY = 86400;
const WEEK = 7 * DAY;
const dayOf = (ts: number) => Math.floor(ts / DAY);
const weekOf = (d: number) => Math.floor((d + 3) / 7);
const weekdayOf = (d: number) => (d + 3) % 7;
const dayStart = (d: number) => d * DAY;
const ZERO_HASH = new Array(32).fill(0);

// 1_788_739_200 = 2026-09-07T00:00:00Z, a Monday (see tests/fixtures.ts /
// src/time.rs for why this replaces the brief's original constant). This
// file gets its own six-weeks-forward slice of the shared validator's
// timeline (see helpers.ts - the clock is a singleton config field moved
// only by `warpTo`) so its weeks never collide with config.test.ts's
// (week_of(T0)) or ticket.test.ts's (week_of(T0) + 1..3), and every warp
// below only moves further forward from here - never backward.
const BASE = 1_788_739_200 + 6 * WEEK;

describe("submit_daily_best", () => {
  let ctx: Ctx;
  let W: number; // the week alice/bob's day-D records live in
  let D: number; // Monday of week W

  before(async () => {
    ctx = await setup();
    await initConfig(ctx);
    await warpTo(ctx, BASE + 3600);
    D = dayOf(await ctx.now());
    W = weekOf(D);
    await createWeekPool(ctx, W);
    await createWeekPool(ctx, W + 1); // needed ahead of time for the rollover test
    await createPlayer(ctx, ctx.alice);
    await createPlayer(ctx, ctx.bob);
    await ctx.mintTo(ctx.alice.publicKey, 100_000_000n);
    await ctx.mintTo(ctx.bob.publicKey, 100_000_000n);
    await buyTicket(ctx, ctx.alice, W);
    await buyTicket(ctx, ctx.bob, W);
  });

  it("records a score into dayBests, sets week/weekUpdatedAt and the week pool's top[0]", async () => {
    const now = await ctx.now();
    await submit(ctx, ctx.alice, D, 100);

    const p = await fetchPlayer(ctx, ctx.alice);
    expect(p.dayBests[weekdayOf(D)]).to.equal(100);
    expect(p.week).to.equal(W);
    expect(p.weekUpdatedAt.toNumber()).to.equal(now);

    const pool = await fetchWeekPool(ctx, W);
    expect(pool.topLen).to.equal(1);
    expect(pool.top[0].player.equals(ctx.alice.publicKey)).to.be.true;
    expect(pool.top[0].total.toString()).to.equal("100");
    expect(pool.top[0].updatedAt.toNumber()).to.equal(now);
  });

  it("a lower score fails with NotAnImprovement; a higher one replaces it and top keeps one entry per player", async () => {
    let lowerErr = "";
    try {
      await submit(ctx, ctx.alice, D, 50);
    } catch (e: any) {
      lowerErr = e.message;
    }
    expect(lowerErr).to.contain("NotAnImprovement");

    const t2 = (await ctx.now()) + 60;
    await warpTo(ctx, t2);
    await submit(ctx, ctx.alice, D, 200);

    const p = await fetchPlayer(ctx, ctx.alice);
    expect(p.dayBests[weekdayOf(D)]).to.equal(200);

    const pool = await fetchWeekPool(ctx, W);
    expect(pool.topLen).to.equal(1); // still just alice - no duplicate slot
    expect(pool.top[0].player.equals(ctx.alice.publicKey)).to.be.true;
    expect(pool.top[0].total.toString()).to.equal("200");
    expect(pool.top[0].updatedAt.toNumber()).to.equal(t2);
  });

  it("fails without the server signature and with a wrong server keypair", async () => {
    const ix = await submitIx(ctx, ctx.alice, D, 201);
    let missingErr = "";
    try {
      await ctx.send([ix], [ctx.alice]); // no ctx.server co-signer
    } catch (e: any) {
      missingErr = e.message;
    }
    expect(missingErr).to.not.equal("");

    const wrongServer = Keypair.generate();
    const badIx = await submitIx(
      ctx,
      ctx.alice,
      D,
      201,
      ZERO_HASH,
      wrongServer.publicKey
    );
    let wrongErr = "";
    try {
      await ctx.send([badIx], [ctx.alice, wrongServer]);
    } catch (e: any) {
      wrongErr = e.message;
    }
    expect(wrongErr).to.not.equal("");
    expect(wrongErr).to.contain("ConstraintHasOne");
  });

  it("accepts a record inside the day's grace window, rejects one after it, and the next day needs its own ticket", async () => {
    const closeButOpen = dayStart(D + 1) + 899;
    await warpTo(ctx, closeButOpen);
    await submit(ctx, ctx.bob, D, 10);
    const p = await fetchPlayer(ctx, ctx.bob);
    expect(p.dayBests[weekdayOf(D)]).to.equal(10);

    const closed = dayStart(D + 1) + 900;
    await warpTo(ctx, closed);
    let dayClosedErr = "";
    try {
      await submit(ctx, ctx.bob, D, 20);
    } catch (e: any) {
      dayClosedErr = e.message;
    }
    expect(dayClosedErr).to.contain("DayClosed");

    let noTicketErr = "";
    try {
      await submit(ctx, ctx.bob, D + 1, 10); // bob only ever bought a ticket for day D
    } catch (e: any) {
      noTicketErr = e.message;
    }
    expect(noTicketErr).to.contain("NoTicketForDay");
  });

  it("rolls dayBests over on a new week's record and rejects a late record for the old week with StaleWeek", async () => {
    // Alice buys a ticket on the last day of week W (Sunday) so that, once
    // she also buys the next week's ticket below, `prevTicketDay` covers
    // that Sunday - the only day of week W still inside its grace window
    // by the time she has rolled over to week W + 1, and so the only day
    // that can genuinely trigger StaleWeek rather than DayClosed or
    // NoTicketForDay (that day's own DayClosed window only ends 900s into
    // the next Monday, so this all still runs forward from D).
    const sunday = D + 6;
    await warpTo(ctx, dayStart(sunday) + 60);
    await buyTicket(ctx, ctx.alice, W);

    const monday2 = D + 7; // first day of week W + 1
    await warpTo(ctx, dayStart(monday2) + 60);
    await buyTicket(ctx, ctx.alice, W + 1);

    await submit(ctx, ctx.alice, monday2, 42);
    const p = await fetchPlayer(ctx, ctx.alice);
    expect(p.week).to.equal(W + 1);
    expect(p.dayBests).to.deep.equal([42, 0, 0, 0, 0, 0, 0]);

    let staleErr = "";
    try {
      await submit(ctx, ctx.alice, sunday, 999);
    } catch (e: any) {
      staleErr = e.message;
    }
    expect(staleErr).to.contain("StaleWeek");
  });

  it("keeps the top 10 by total desc (tie-break: earlier updatedAt first) and drops the 11th", async () => {
    const week3 = W + 2;
    const day3 = D + 14; // Monday of week3, well after every earlier record in this file
    await createWeekPool(ctx, week3);

    const players = Array.from({ length: 11 }, () => Keypair.generate());
    for (const kp of players) {
      await airdrop(ctx.connection, kp.publicKey, 10 * LAMPORTS_PER_SOL);
    }
    for (const kp of players) {
      await createPlayer(ctx, kp);
      await ctx.mintTo(kp.publicKey, 10_000_000n); // exactly one ticket's worth
    }

    await warpTo(ctx, dayStart(day3) + 3600);
    for (const kp of players) {
      await buyTicket(ctx, kp, week3);
    }

    // players[1] and players[2] tie at 100: players[1] records first (an
    // earlier updatedAt), so it must rank ahead of players[2] despite the
    // equal total. players[10] (the lowest) must not make the top 10.
    const scores = [110, 100, 100, 90, 80, 70, 60, 50, 40, 30, 20];
    let now = dayStart(day3) + 3600;
    for (let i = 0; i < players.length; i++) {
      now += 60;
      await warpTo(ctx, now);
      await submit(ctx, players[i], day3, scores[i]);
    }

    const pool = await fetchWeekPool(ctx, week3);
    expect(pool.topLen).to.equal(10);
    for (let rank = 0; rank < 10; rank++) {
      expect(pool.top[rank].player.equals(players[rank].publicKey)).to.be
        .true;
      expect(pool.top[rank].total.toString()).to.equal(String(scores[rank]));
    }
    expect(
      pool.top.some((e: any) => e.player.equals(players[10].publicKey))
    ).to.be.false;
  });
});
