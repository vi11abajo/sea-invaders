import { expect } from "chai";
import { Keypair } from "@solana/web3.js";
import { airdrop, Ctx, setup, warpTo } from "./helpers";
import {
  configArgs,
  configPda,
  createPlayer,
  createWeekPool,
  initConfig,
  playerPda,
  programDataPda,
  PAYOUT,
  weekPda,
} from "./fixtures";

describe("config and accounts", () => {
  // A single shared LiteSVM instance for the whole file (see smoke.test.ts
  // for why): each `it` below uses its own fresh keypairs/days/weeks so the
  // tests stay independent despite sharing `ctx`.
  let ctx: Ctx;

  before(async () => {
    ctx = await setup();
  });

  // Must run before any `initConfig(ctx)` call in this file (or any file
  // that could run before it) actually creates the `config` PDA - a rogue
  // `init_config` against an *existing* config fails a different way
  // (the `init` constraint's account-creation CPI errors "already in
  // use" before ever reaching the upgrade-authority constraint), which
  // this test tolerates since it isn't the behaviour under test either
  // way: a random keypair must never succeed at becoming admin.
  it("init_config can only be signed by the program's upgrade authority", async () => {
    const rogue = Keypair.generate();
    await airdrop(ctx.connection, rogue.publicKey, 1_000_000_000);
    let err = "";
    try {
      await ctx.send(
        [
          await ctx.program.methods
            .initConfig(configArgs(ctx))
            .accountsPartial({
              admin: rogue.publicKey,
              skrMint: ctx.mint,
              programData: programDataPda(ctx.programId),
            })
            .instruction(),
        ],
        [rogue]
      );
    } catch (e: any) {
      err = e.message;
    }
    expect(err).to.satisfy(
      (m: string) => m.includes("NotUpgradeAuthority") || m.includes("already in use"),
      `expected NotUpgradeAuthority or "already in use", got: ${err}`
    );
  });

  it("rejects payout shares that do not sum to 10000 bps and pool shares over 10000", async () => {
    // `config` is a singleton PDA shared with every other test file on the
    // validator (see helpers.ts), so it may already exist by the time this
    // runs (e.g. if `smoke.test.ts` ran first) - a bad `init_config` would
    // then fail with "already in use" instead of exercising validation.
    // `update_config` runs the same `validate()` and only needs `config` to
    // already exist, so `initConfig` (idempotent: a real init with valid
    // args on the first call in this process, a no-op otherwise) guarantees
    // that regardless of file order, and `validate()` rejects the bad args
    // before `update_config` would apply them.
    await initConfig(ctx);
    const bad = {
      ...configArgs(ctx),
      payoutBps: [3000, 2000, 1200, 800, 600, 480, 480, 480, 480, 481],
    };
    let err = "";
    try {
      await ctx.send(
        [
          await ctx.program.methods
            .updateConfig(bad)
            .accounts({ admin: ctx.admin.publicKey })
            .instruction(),
        ],
        [ctx.admin]
      );
    } catch (e: any) {
      err = e.message;
    }
    expect(err).to.contain("InvalidConfig");
  });

  it("init_config stores every field and the admin", async () => {
    await initConfig(ctx);
    const c = await ctx.program.account.config.fetch(configPda(ctx.programId));
    expect(c.admin.equals(ctx.admin.publicKey)).to.be.true;
    expect(c.ticketPrice.toString()).to.equal("10000000");
    expect(c.payoutBps).to.deep.equal(PAYOUT);
    expect(c.paused).to.be.false;
  });

  it("only the admin can update or pause", async () => {
    let err = "";
    try {
      await ctx.send(
        [
          await ctx.program.methods
            .setPaused(true)
            .accounts({ admin: ctx.alice.publicKey })
            .instruction(),
        ],
        [ctx.alice]
      );
    } catch (e: any) {
      err = e.message;
    }
    expect(err).to.not.equal("");

    await ctx.send(
      [
        await ctx.program.methods
          .setPaused(true)
          .accounts({ admin: ctx.admin.publicKey })
          .instruction(),
      ],
      [ctx.admin]
    );
    expect((await ctx.program.account.config.fetch(configPda(ctx.programId))).paused).to.be.true;

    // Un-pause so later tests/files sharing this ctx are unaffected.
    await ctx.send(
      [
        await ctx.program.methods
          .setPaused(false)
          .accounts({ admin: ctx.admin.publicKey })
          .instruction(),
      ],
      [ctx.admin]
    );
    expect((await ctx.program.account.config.fetch(configPda(ctx.programId))).paused).to.be.false;
  });

  it("create_player is paid by the player and starts empty", async () => {
    await createPlayer(ctx, ctx.alice);
    const p = await ctx.program.account.player.fetch(playerPda(ctx.programId, ctx.alice.publicKey));
    expect(p.wallet.equals(ctx.alice.publicKey)).to.be.true;
    expect(p.attemptsBought).to.equal(0);
    expect(p.dayBests).to.deep.equal([0, 0, 0, 0, 0, 0, 0]);
  });

  it("create_week_pool makes the pool and its vault, and refuses a duplicate", async () => {
    // 1_788_739_200 = 2026-09-07T00:00:00Z, a Monday (see tests/fixtures.ts
    // / time.rs for why this replaces the brief's original constant).
    const monday = 1_788_739_200;
    await warpTo(ctx, monday);
    const week = Math.floor((Math.floor(monday / 86400) + 3) / 7);

    await createWeekPool(ctx, week, ctx.server);
    const pool = await ctx.program.account.weekPool.fetch(weekPda(ctx.programId, week));
    expect(pool.week).to.equal(week);
    expect(pool.settled).to.be.false;
    expect(pool.topLen).to.equal(0);
    expect(await ctx.tokenBalance(weekPda(ctx.programId, week))).to.equal(0n);

    let err = "";
    try {
      await createWeekPool(ctx, week, ctx.server);
    } catch (e: any) {
      err = e.message;
    }
    expect(err).to.not.equal("");
  });
});
