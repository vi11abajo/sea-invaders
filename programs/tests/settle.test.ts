import { expect } from "chai";
import { Keypair } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  closeAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { airdrop, Ctx, setup, warpTo } from "./helpers";
import {
  buyTicket,
  createPlayer,
  createWeekPool,
  fetchWeekPool,
  fundPool,
  initConfig,
  settleWeek,
  submit,
  weekPda,
} from "./fixtures";

const LAMPORTS_PER_SOL = 1_000_000_000;
const DAY = 86400;
const WEEK = 7 * DAY;
const dayOf = (ts: number) => Math.floor(ts / DAY);
const weekOf = (d: number) => Math.floor((d + 3) / 7);
const weekFirstDay = (w: number) => w * 7 - 3; // the Monday that starts week w
const weekEnd = (w: number) => weekFirstDay(w + 1) * DAY;
const dayStart = (d: number) => d * DAY;

// 1_788_739_200 = 2026-09-07T00:00:00Z, a Monday (see tests/fixtures.ts /
// src/time.rs for why this replaces the brief's original constant). This
// file gets its own twelve-weeks-forward slice of the shared validator's
// timeline (see helpers.ts - the clock is a singleton config field moved
// only by `warpTo`), past every other file's own range (config.test.ts:
// week_of(T0); ticket.test.ts: + 1..4; record.test.ts: + 6..8), so this
// file's weeks never collide, and every warp below only moves further
// forward - never backward.
const BASE = 1_788_739_200 + 12 * WEEK;

describe("fund_pool / settle_week", () => {
  let ctx: Ctx;
  let W: number; // the week alice/bob/carol's day-D records live in
  let D: number; // Monday of week W
  const carol = Keypair.generate();

  before(async () => {
    ctx = await setup();
    await initConfig(ctx);
    await airdrop(ctx.connection, carol.publicKey, 10 * LAMPORTS_PER_SOL);

    await warpTo(ctx, BASE + 3600);
    D = dayOf(await ctx.now());
    W = weekOf(D);
    await createWeekPool(ctx, W);
    await createWeekPool(ctx, W + 1); // the rollover target for W's settlement

    await createPlayer(ctx, ctx.alice);
    await createPlayer(ctx, ctx.bob);
    await createPlayer(ctx, carol);

    // Each buys exactly one ticket for week W: 9_500_000 of the 10_000_000
    // price goes to the pool (see ticket.rs's split), so three tickets put
    // 28_500_000 in the vault before fund_pool's own test adds the rest.
    // Bob is minted extra so his own fund_pool call (test 1) doesn't need
    // a second mint.
    await ctx.mintTo(ctx.alice.publicKey, 10_000_000n);
    await ctx.mintTo(ctx.bob.publicKey, 11_500_000n);
    await ctx.mintTo(carol.publicKey, 10_000_000n);
    await buyTicket(ctx, ctx.alice, W);
    await buyTicket(ctx, ctx.bob, W);
    await buyTicket(ctx, carol, W);

    // Carol's ticket purchase spent her whole balance, so her ATA now
    // holds exactly 0 - close it so it is fully absent (not just empty)
    // by settlement time, per the brief's test 4: settle_week must create
    // it from scratch for her payout.
    await closeAccount(
      ctx.connection,
      carol,
      ctx.ata(carol.publicKey),
      carol.publicKey,
      carol
    );

    await submit(ctx, ctx.alice, D, 300);
    await submit(ctx, ctx.bob, D, 200);
    await submit(ctx, carol, D, 100);
  });

  it("fund_pool moves exactly the amount into the current vault, from anyone", async () => {
    const before = await ctx.tokenBalance(weekPda(ctx.programId, W));
    expect(before).to.equal(28_500_000n); // 3 tickets' pool share

    await fundPool(ctx, ctx.bob, 1_500_000, W); // bob funds it, not a winner-only action

    const after = await ctx.tokenBalance(weekPda(ctx.programId, W));
    expect(after - before).to.equal(1_500_000n);
    expect(after).to.equal(30_000_000n);
  });

  it("settle_week fails with WeekNotFinished before week_end + grace", async () => {
    const winners = [ctx.alice.publicKey, ctx.bob.publicKey, carol.publicKey];
    let err = "";
    try {
      await settleWeek(ctx, ctx.server, W, winners);
    } catch (e: any) {
      err = e.message;
    }
    expect(err).to.contain("WeekNotFinished");
  });

  let serverSolBefore = 0;
  let serverSolAfter = 0;

  it("settles at week_end + grace: pays the top-10 shares, rolls the remainder to W+1, marks settled, and a second call fails with AlreadySettled", async () => {
    await warpTo(ctx, weekEnd(W) + 900);

    const winners = [ctx.alice.publicKey, ctx.bob.publicKey, carol.publicKey];
    serverSolBefore = await ctx.connection.getBalance(ctx.server.publicKey);
    await settleWeek(ctx, ctx.server, W, winners);
    serverSolAfter = await ctx.connection.getBalance(ctx.server.publicKey);

    // alice: spent her whole 10_000_000 on the ticket, then wins 30 %.
    expect(await ctx.tokenBalance(ctx.alice.publicKey)).to.equal(9_000_000n);
    // bob: spent his whole 11_500_000 (ticket + the fund_pool test above),
    // then wins 20 %.
    expect(await ctx.tokenBalance(ctx.bob.publicKey)).to.equal(6_000_000n);
    // carol: her ATA was closed (0), settle_week recreates it, then wins 12 %.
    expect(await ctx.tokenBalance(carol.publicKey)).to.equal(3_600_000n);

    // The empty ranks 4-10's shares (800+600+480*5 = 3_800 bps of 30_000_000)
    // roll over to W + 1's vault untouched.
    expect(await ctx.tokenBalance(weekPda(ctx.programId, W + 1))).to.equal(
      11_400_000n
    );
    expect(await ctx.tokenBalance(weekPda(ctx.programId, W))).to.equal(0n);

    const pool = await fetchWeekPool(ctx, W);
    expect(pool.settled).to.equal(true);

    let err = "";
    try {
      await settleWeek(ctx, ctx.server, W, winners);
    } catch (e: any) {
      err = e.message;
    }
    expect(err).to.contain("AlreadySettled");
  });

  it("creates carol's missing ATA on settlement, and the caller (server) pays its rent", async () => {
    const carolAta = await ctx.connection.getAccountInfo(
      ctx.ata(carol.publicKey)
    );
    expect(carolAta).to.not.equal(null);
    expect(await ctx.tokenBalance(carol.publicKey)).to.equal(3_600_000n);

    // The server signed and paid for two settle_week calls in the previous
    // test (one landing, one rejected by the AlreadySettled preflight
    // simulation before ever costing a fee) plus one ATA's rent
    // (~0.00203928 SOL) here - so its balance must have dropped by more
    // than a bare landed-tx fee, but nowhere near a full SOL.
    const dropped = serverSolBefore - serverSolAfter;
    expect(dropped).to.be.greaterThan(1_000_000);
    expect(dropped).to.be.lessThan(3_000_000);
  });

  it("fails with WinnerMismatch when winners are passed out of order or with a foreign ATA", async () => {
    const week2 = W + 2;
    await createWeekPool(ctx, week2);
    await createWeekPool(ctx, week2 + 1);

    const dave = Keypair.generate();
    const eve = Keypair.generate();
    await airdrop(ctx.connection, dave.publicKey, 10 * LAMPORTS_PER_SOL);
    await airdrop(ctx.connection, eve.publicKey, 10 * LAMPORTS_PER_SOL);
    await createPlayer(ctx, dave);
    await createPlayer(ctx, eve);
    await ctx.mintTo(dave.publicKey, 10_000_000n);
    await ctx.mintTo(eve.publicKey, 10_000_000n);

    const day2 = weekFirstDay(week2);
    await warpTo(ctx, dayStart(day2) + 3600);
    await buyTicket(ctx, dave, week2);
    await buyTicket(ctx, eve, week2);
    await submit(ctx, dave, day2, 50);
    await submit(ctx, eve, day2, 30);
    // top(week2) = [dave (50), eve (30)]

    await warpTo(ctx, weekEnd(week2) + 900);

    let wrongOrderErr = "";
    try {
      // eve first, dave second - the reverse of `top`'s actual order.
      await settleWeek(ctx, ctx.server, week2, [
        eve.publicKey,
        dave.publicKey,
      ]);
    } catch (e: any) {
      wrongOrderErr = e.message;
    }
    expect(wrongOrderErr).to.contain("WinnerMismatch");

    const weekPool2 = weekPda(ctx.programId, week2);
    const nextWeekPool2 = weekPda(ctx.programId, week2 + 1);
    const ix = await ctx.program.methods
      .settleWeek(week2)
      .accountsPartial({
        caller: ctx.server.publicKey,
        weekPool: weekPool2,
        vault: ctx.ata(weekPool2),
        nextWeekPool: nextWeekPool2,
        nextVault: ctx.ata(nextWeekPool2),
        skrMint: ctx.mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([
        // correct wallet order, but dave's slot carries eve's ATA
        { pubkey: dave.publicKey, isWritable: false, isSigner: false },
        { pubkey: ctx.ata(eve.publicKey), isWritable: true, isSigner: false },
        { pubkey: eve.publicKey, isWritable: false, isSigner: false },
        { pubkey: ctx.ata(eve.publicKey), isWritable: true, isSigner: false },
      ])
      .instruction();

    let foreignAtaErr = "";
    try {
      await ctx.send([ix], [ctx.server]);
    } catch (e: any) {
      foreignAtaErr = e.message;
    }
    expect(foreignAtaErr).to.contain("WinnerMismatch");
  });

  it("floors a winner's share and rolls the rounding dust over to next week's vault", async () => {
    // The brief's own rounding example (a 1_000_001 vault, one winner,
    // 3000 bps -> floor(300_000.3) = 300_000, 700_001 rolling over) cannot
    // be reached through this validator's shared config: the smallest
    // possible non-zero contribution to any week's vault is one ticket's
    // pool share (9_500_000, fixed by config.ticket_price/ticket_pool_bps
    // for the whole run), already bigger than that whole balance. The
    // exact brief numbers are instead checked as a Rust unit test on
    // `share_of` in settle.rs; this test demonstrates the same floor
    // rounding and rollover on-chain, at a balance this harness can
    // actually produce: one ticket (9_500_000) plus a 1-unit fund_pool
    // top-up (9_500_001), which 3000 bps does not divide evenly.
    const week3 = W + 4;
    await createWeekPool(ctx, week3);
    await createWeekPool(ctx, week3 + 1);

    const fred = Keypair.generate();
    await airdrop(ctx.connection, fred.publicKey, 10 * LAMPORTS_PER_SOL);
    await createPlayer(ctx, fred);
    await ctx.mintTo(fred.publicKey, 10_000_001n);

    const day3 = weekFirstDay(week3);
    await warpTo(ctx, dayStart(day3) + 3600);
    await buyTicket(ctx, fred, week3); // vault = 9_500_000
    await fundPool(ctx, fred, 1, week3); // vault = 9_500_001
    await submit(ctx, fred, day3, 10); // top(week3) = [fred (10)]

    await warpTo(ctx, weekEnd(week3) + 900);
    await settleWeek(ctx, ctx.server, week3, [fred.publicKey]);

    // floor(9_500_001 * 3000 / 10_000) = floor(2_850_000.3) = 2_850_000
    expect(await ctx.tokenBalance(fred.publicKey)).to.equal(2_850_000n);
    expect(await ctx.tokenBalance(weekPda(ctx.programId, week3))).to.equal(
      0n
    );
    expect(
      await ctx.tokenBalance(weekPda(ctx.programId, week3 + 1))
    ).to.equal(6_650_001n);
  });
});
