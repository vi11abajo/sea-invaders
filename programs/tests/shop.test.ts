import { expect } from "chai";
import { Keypair } from "@solana/web3.js";
import { BN } from "@anchor-lang/core";
import { airdrop, Ctx, setup, warpTo } from "./helpers";
import {
  CATALOG_ITEMS,
  createPlayer,
  createWeekPool,
  fetchCatalog,
  fetchPlayer,
  getEvent,
  initCatalog,
  initConfig,
  purchase,
  setCatalog,
  weekPda,
} from "./fixtures";

const DAY = 86400;
const WEEK = 7 * DAY;
const dayOf = (ts: number) => Math.floor(ts / DAY);
const weekOf = (d: number) => Math.floor((d + 3) / 7);

// 1_788_739_200 = 2026-09-07T00:00:00Z, a Monday (see tests/fixtures.ts /
// src/time.rs for why this replaces the brief's original constant). This
// file gets its own +20-weeks-forward slice of the shared validator's
// timeline (see helpers.ts), past every other file's own range
// (config.test.ts: week_of(T0); ticket.test.ts: +1..3; record.test.ts:
// +6..8; settle.test.ts: +12..19) - tide.test.ts takes +24 onward, so the
// two stay disjoint too.
const T0 = 1_788_739_200;
const BASE = T0 + 20 * WEEK;

const HARPOON = 0; // variant, 40 SKR
const LILAC = 4; // skin, 25 SKR

describe("catalog and purchase", () => {
  let ctx: Ctx;
  let week: number;
  let rogue: Keypair;
  let rogueInitCatalogErr = "";

  before(async () => {
    ctx = await setup();
    await initConfig(ctx);
    await warpTo(ctx, BASE + 3600);
    week = weekOf(dayOf(await ctx.now()));
    await createWeekPool(ctx, week);
    await createPlayer(ctx, ctx.alice);
    await ctx.mintTo(ctx.alice.publicKey, 1_000_000_000n); // 1000 SKR

    // Attempted here, before the catalog exists, so `InitCatalog`'s own
    // `init` on `catalog` actually runs: Anchor 1.2's generated
    // `try_accounts` constructs every `init` field (running the system
    // program's account creation) before it evaluates the other fields'
    // constraints such as `has_one`, so trying this once `catalog`
    // already exists (as the real `initCatalog` below leaves it) only
    // ever fails "already in use" on `catalog` itself and never reaches
    // `config`'s `has_one = admin` (shop.rs's `InitCatalog`) at all. The
    // whole transaction still reverts when that `has_one` check fails
    // here, so `catalog` is not actually left behind for the real
    // `initCatalog` call that follows (see config.test.ts's own rogue
    // `init_config` test for the same "run it before the real init"
    // pattern).
    rogue = Keypair.generate();
    await airdrop(ctx.connection, rogue.publicKey, 1_000_000_000);
    try {
      await ctx.send(
        [
          await ctx.program.methods
            .initCatalog({ items: CATALOG_ITEMS })
            .accountsPartial({ admin: rogue.publicKey })
            .instruction(),
        ],
        [rogue]
      );
    } catch (e: any) {
      rogueInitCatalogErr = e.message;
    }

    await initCatalog(ctx);
  });

  it("init_catalog stores every item's id, kind, price and active flag", async () => {
    const catalog = await fetchCatalog(ctx);
    expect(catalog.count).to.equal(CATALOG_ITEMS.length);
    for (let i = 0; i < CATALOG_ITEMS.length; i++) {
      expect(catalog.items[i].id).to.equal(CATALOG_ITEMS[i].id);
      expect(catalog.items[i].kind).to.equal(CATALOG_ITEMS[i].kind);
      expect(catalog.items[i].price.toString()).to.equal(
        CATALOG_ITEMS[i].price.toString()
      );
      expect(catalog.items[i].active).to.be.true;
    }
  });

  it("only the config admin can init or update the catalog", async () => {
    // Sent in `before()`, before the catalog existed, so this actually
    // reached `config`'s `has_one = admin` - see the comment there.
    expect(rogueInitCatalogErr).to.contain("ConstraintHasOne");

    const before = await fetchCatalog(ctx);
    let setErr = "";
    try {
      await setCatalog(ctx, CATALOG_ITEMS, rogue);
    } catch (e: any) {
      setErr = e.message;
    }
    expect(setErr).to.contain("ConstraintHasOne");

    // `set_catalog` is the one instruction that can re-price every item -
    // a rogue call rejected above must leave the catalog untouched.
    const after = await fetchCatalog(ctx);
    expect(after.count).to.equal(before.count);
    for (let i = 0; i < before.count; i++) {
      expect(after.items[i].id).to.equal(before.items[i].id);
      expect(after.items[i].kind).to.equal(before.items[i].kind);
      expect(after.items[i].price.toString()).to.equal(
        before.items[i].price.toString()
      );
      expect(after.items[i].active).to.equal(before.items[i].active);
    }
  });

  it("buys an item once, splitting 20% to the pool and 80% to the treasury, and sets its inventory bit", async () => {
    const treasuryBefore = await ctx.tokenBalance(ctx.admin.publicKey);
    const aliceBefore = await ctx.tokenBalance(ctx.alice.publicKey);

    const sig = await purchase(ctx, ctx.alice, HARPOON, new BN(40_000_000), week);

    expect(await ctx.tokenBalance(ctx.alice.publicKey)).to.equal(
      aliceBefore - 40_000_000n
    );
    expect(await ctx.tokenBalance(weekPda(ctx.programId, week))).to.equal(
      8_000_000n
    );
    expect(await ctx.tokenBalance(ctx.admin.publicKey)).to.equal(
      treasuryBefore + 32_000_000n
    );

    const p = await fetchPlayer(ctx, ctx.alice);
    expect(p.inventory.eq(new BN(1 << HARPOON))).to.be.true;

    // The backend reads this event to confirm and cache the purchase -
    // assert its payload matches what was actually charged and stored.
    const event = await getEvent(ctx, sig, "itemPurchased");
    expect(event.wallet.equals(ctx.alice.publicKey)).to.be.true;
    expect(event.item).to.equal(HARPOON);
    expect(event.price.toString()).to.equal("40000000");
    expect(event.week).to.equal(week);
  });

  it("buys every catalog item once, keyed by id rather than slot order, and accumulates the inventory mask", async () => {
    // A fresh player, independent of alice's purchases/failures above.
    await createPlayer(ctx, ctx.bob);
    await ctx.mintTo(ctx.bob.publicKey, 1_000_000_000n); // 1000 SKR

    // Rotate the catalog by one slot (not reverse it - reversing this
    // odd-length, 7-item list leaves the middle item, id 3, at its own
    // slot 3) so every item's slot index differs from its id - proves
    // `find_item` (shop.rs) looks items up by `id`, not by array
    // position, and that `inventory |= bit` (not `= bit`) accumulates
    // bits keyed by id across purchases in this shuffled order.
    const shuffled = [...CATALOG_ITEMS.slice(1), CATALOG_ITEMS[0]];
    await setCatalog(ctx, shuffled);

    let expectedInventory = 0;
    for (const item of CATALOG_ITEMS) {
      const treasuryBefore = await ctx.tokenBalance(ctx.admin.publicKey);
      const poolBefore = await ctx.tokenBalance(weekPda(ctx.programId, week));

      await purchase(ctx, ctx.bob, item.id, item.price, week);

      const price = BigInt(item.price.toString());
      const pool = (price * 2000n) / 10000n;
      const treasury = price - pool;
      expect(await ctx.tokenBalance(ctx.admin.publicKey)).to.equal(
        treasuryBefore + treasury
      );
      expect(await ctx.tokenBalance(weekPda(ctx.programId, week))).to.equal(
        poolBefore + pool
      );

      expectedInventory |= 1 << item.id;
      const p = await fetchPlayer(ctx, ctx.bob);
      expect(p.inventory.eq(new BN(expectedInventory))).to.be.true;
    }

    const p = await fetchPlayer(ctx, ctx.bob);
    expect(p.inventory.eq(new BN(0b111_1111))).to.be.true;

    // Restore the catalog's original order for the tests that follow.
    await setCatalog(ctx, CATALOG_ITEMS);
  });

  it("a second purchase of the same item fails with AlreadyOwned", async () => {
    let err = "";
    try {
      await purchase(ctx, ctx.alice, HARPOON, new BN(40_000_000), week);
    } catch (e: any) {
      err = e.message;
    }
    expect(err).to.contain("AlreadyOwned");
  });

  it("a max_price below the catalog price fails with PriceChanged and leaves the item unowned", async () => {
    let err = "";
    try {
      await purchase(ctx, ctx.alice, LILAC, new BN(24_999_999), week);
    } catch (e: any) {
      err = e.message;
    }
    expect(err).to.contain("PriceChanged");

    const p = await fetchPlayer(ctx, ctx.alice);
    expect(p.inventory.and(new BN(1 << LILAC)).isZero()).to.be.true;
  });

  it("an inactive item fails with ItemInactive", async () => {
    const disabled = CATALOG_ITEMS.map((it) =>
      it.id === LILAC ? { ...it, active: false } : it
    );
    await setCatalog(ctx, disabled);
    let err = "";
    try {
      await purchase(ctx, ctx.alice, LILAC, new BN(25_000_000), week);
    } catch (e: any) {
      err = e.message;
    }
    expect(err).to.contain("ItemInactive");

    // Restore the catalog for any later test relying on the full set.
    await setCatalog(ctx, CATALOG_ITEMS);

    const p = await fetchPlayer(ctx, ctx.alice);
    expect(p.inventory.and(new BN(1 << LILAC)).isZero()).to.be.true;
  });

  it("an unknown item id fails with UnknownItem", async () => {
    let err = "";
    try {
      await purchase(ctx, ctx.alice, 9, new BN(1_000_000_000), week);
    } catch (e: any) {
      err = e.message;
    }
    expect(err).to.contain("UnknownItem");
  });

  it("refuses a purchase while the program is paused", async () => {
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
        await purchase(ctx, ctx.alice, LILAC, new BN(25_000_000), week);
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

  it("set_catalog accepts a full 64-item list and rejects a 65th", async () => {
    // Fills every id 0..63 - `MAX_CATALOG_ITEMS` is exactly the width of
    // `Player.inventory`'s bitmask (state.rs), so this is the largest
    // list `build_items` (shop.rs) can ever accept.
    const full = Array.from({ length: 64 }, (_, id) => ({
      id,
      kind: 0,
      price: new BN(1),
      active: true,
    }));
    await setCatalog(ctx, full);
    const catalog = await fetchCatalog(ctx);
    expect(catalog.count).to.equal(64);
    for (let i = 0; i < full.length; i++) {
      expect(catalog.items[i].id).to.equal(full[i].id);
    }

    // One more than the max - `build_items` rejects this with
    // `InvalidConfig` (its `args.items.len() <= MAX_CATALOG_ITEMS` check)
    // before it ever looks at the extra item's own id.
    let err = "";
    try {
      await setCatalog(ctx, [...full, full[0]]);
    } catch (e: any) {
      err = e.message;
    }
    expect(err).to.contain("InvalidConfig");

    // Every test file shares this one catalog (see fixtures.ts's
    // `initCatalog` comment) - restore the original seven items so any
    // later-run file's own matching check still sees what it expects.
    await setCatalog(ctx, CATALOG_ITEMS);
  });
});
