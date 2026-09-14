import { AccountMeta, ComputeBudgetProgram, PublicKey, Keypair } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BN, EventParser } from "@anchor-lang/core";
import { configPda, Ctx } from "./helpers";

// Re-exported so existing imports of `configPda` from "./fixtures" (e.g.
// config.test.ts) keep working - the PDA derivation itself lives in
// helpers.ts (see the comment above `sharedAdmin` there) so `now()` can use
// it too without fixtures.ts and helpers.ts importing each other both ways.
export { configPda };

// The BPF Upgradeable Loader's well-known program id - not exported by this
// version of @solana/web3.js, so it is hardcoded here the same way Anchor
// itself does internally.
const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111"
);

/** The `ProgramData` account for `programId` under the BPF Upgradeable Loader - holds
 * `upgrade_authority_address`, which `init_config` now requires the signer to match. */
export function programDataPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [programId.toBuffer()],
    BPF_LOADER_UPGRADEABLE_PROGRAM_ID
  )[0];
}

// @anchor-lang/core's borsh coder (unlike @coral-xyz/anchor) only accepts
// BN.js instances for u64 fields, not native bigint - the brief's literal
// `BigInt(s) * 1_000_000n` values throw "src.toArrayLike is not a
// function" from BNLayout.encode, so u64 values here use BN instead.
export const LADDER = [25, 30, 40, 50, 60, 75, 95, 120].map((s) =>
  new BN(s).mul(new BN(1_000_000))
);
export const PAYOUT = [3000, 2000, 1200, 800, 600, 480, 480, 480, 480, 480];

export function configArgs(ctx: Ctx) {
  return {
    serverAuthority: ctx.server.publicKey,
    treasury: ctx.treasury,
    ticketPrice: new BN(10_000_000),
    attemptsPerTicket: 3,
    ticketPoolBps: 9500,
    purchasePoolBps: 2000,
    reviveLadder: LADDER,
    ebbSeconds: 7200,
    graceSeconds: 900,
    payoutBps: PAYOUT,
  };
}

export const playerPda = (pid: PublicKey, wallet: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("player"), wallet.toBuffer()],
    pid
  )[0];

export const catalogPda = (pid: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("catalog")], pid)[0];

// The seven items of design §1 - kind 0 = variant (ids 0..2), kind 1 = skin
// (ids 3..6). Prices are the design's SKR figures, in base units (6
// decimals, same as LADDER above).
export const CATALOG_ITEMS = [
  { id: 0, kind: 0, price: 40 }, // Harpoon
  { id: 1, kind: 0, price: 60 }, // Anchor
  { id: 2, kind: 0, price: 90 }, // Trident
  { id: 3, kind: 1, price: 25 }, // Lime
  { id: 4, kind: 1, price: 25 }, // Lilac
  { id: 5, kind: 1, price: 35 }, // Ember
  { id: 6, kind: 1, price: 50 }, // Abyss
].map((it) => ({
  id: it.id,
  kind: it.kind,
  price: new BN(it.price).mul(new BN(1_000_000)),
  active: true,
}));

export const weekPda = (pid: PublicKey, week: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(week);
  return PublicKey.findProgramAddressSync([Buffer.from("week"), b], pid)[0];
};

// Idempotent: `config` is a singleton PDA shared by every test file on the
// one validator `anchor test` starts (see helpers.ts), so whichever file's
// `before()` calls this first performs the real `init_config`; every other
// caller (any file, any order) just confirms the existing config matches
// this `ctx` (same shared mint - see helpers.ts's `sharedMint`/`sharedAdmin`
// etc.) and returns without sending a transaction.
export async function initConfig(ctx: Ctx) {
  const pda = configPda(ctx.programId);
  const existing = await ctx.program.account.config.fetchNullable(pda);
  if (existing) {
    if (!existing.skrMint.equals(ctx.mint)) {
      throw new Error(
        `config already initialized with a different skr_mint (${existing.skrMint.toBase58()} != ${ctx.mint.toBase58()}) - ` +
          `every test file must share the same mint (see helpers.ts's sharedMint)`
      );
    }
    return;
  }
  // `program` is not passed: its address is fixed in the IDL (it's the program's own
  // account, resolvable at compile time since `Id::id()` returns the constant declared
  // by `declare_id!`), so Anchor's client resolves it automatically.
  const ix = await ctx.program.methods
    .initConfig(configArgs(ctx))
    .accountsPartial({
      admin: ctx.admin.publicKey,
      skrMint: ctx.mint,
      programData: programDataPda(ctx.programId),
    })
    .instruction();
  await ctx.send([ix], [ctx.admin]);
}

export async function createPlayer(ctx: Ctx, who: Keypair) {
  const ix = await ctx.program.methods
    .createPlayer()
    .accounts({ wallet: who.publicKey })
    .instruction();
  await ctx.send([ix], [who]);
  return playerPda(ctx.programId, who.publicKey);
}

export async function createWeekPool(
  ctx: Ctx,
  week: number,
  payer: Keypair = ctx.server
) {
  // `token_program` is an `Interface<TokenInterface>` in the program (it
  // could be the classic Token program or Token-2022), so Anchor's client
  // cannot auto-resolve it the way it does a fixed-address `Program` - it
  // must be supplied explicitly.
  const ix = await ctx.program.methods
    .createWeekPool(week)
    .accounts({
      payer: payer.publicKey,
      skrMint: ctx.mint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  await ctx.send([ix], [payer]);
  return weekPda(ctx.programId, week);
}

// `vault` and `treasury` are plain (non-PDA-seeded, non-`associated_token`
// constrained) `InterfaceAccount<TokenAccount>`s in `BuyTicket`, and
// `weekPool`'s own seeds read the account's `week` field rather than an
// instruction argument - none of these are derivable by Anchor's client
// resolution the way `config`/`player` are, so every one of them (plus the
// `Interface<TokenInterface>` `tokenProgram`, same as `createWeekPool`
// above) is passed explicitly here.
export async function buyTicket(ctx: Ctx, who: Keypair, week: number) {
  const weekPool = weekPda(ctx.programId, week);
  const ix = await ctx.program.methods
    .buyTicket()
    .accountsPartial({
      wallet: who.publicKey,
      weekPool,
      vault: ctx.ata(weekPool),
      treasury: ctx.treasury,
      walletToken: ctx.ata(who.publicKey),
      skrMint: ctx.mint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  await ctx.send([ix], [who]);
}

export async function fetchPlayer(ctx: Ctx, who: Keypair) {
  return ctx.program.account.player.fetch(
    playerPda(ctx.programId, who.publicKey)
  );
}

export async function fetchWeekPool(ctx: Ctx, week: number) {
  return ctx.program.account.weekPool.fetch(weekPda(ctx.programId, week));
}

// `week_pool`'s seeds read the account's own `week` field (see
// `record.rs` - a self-referential seed like `buy_ticket`'s, needed
// because Anchor 1.2.0's IDL builder cannot express a seed that calls a
// program-defined function such as `time::week_of(day)`), so - unlike
// `config`/`player` above, whose seeds Anchor's client derives on its own
// from constants/args it already has - the client cannot auto-resolve
// `weekPool` without already knowing its address. It is always derived
// and passed explicitly here, the same way `vault`/`treasury` are in
// `buyTicket`.
export async function submitIx(
  ctx: Ctx,
  who: Keypair,
  day: number,
  score: number,
  replayHash: number[] = new Array(32).fill(0),
  serverAuthority: PublicKey = ctx.server.publicKey
) {
  const week = Math.floor((day + 3) / 7);
  return ctx.program.methods
    .submitDailyBest(day, score, replayHash)
    .accountsPartial({
      wallet: who.publicKey,
      serverAuthority,
      weekPool: weekPda(ctx.programId, week),
    })
    .instruction();
}

export async function submit(
  ctx: Ctx,
  who: Keypair,
  day: number,
  score: number,
  replayHash?: number[]
) {
  const ix = await submitIx(ctx, who, day, score, replayHash);
  await ctx.send([ix], [who, ctx.server]);
}

// Anyone can top up a week's vault directly - `week_pool`'s seeds read its
// own `week` field (see `settle.rs`), so it is derived and passed
// explicitly the same way `buyTicket`'s is above.
export async function fundPool(
  ctx: Ctx,
  funder: Keypair,
  amount: number | bigint,
  week: number
) {
  const weekPool = weekPda(ctx.programId, week);
  const ix = await ctx.program.methods
    .fundPool(new BN(amount.toString()))
    .accountsPartial({
      funder: funder.publicKey,
      weekPool,
      vault: ctx.ata(weekPool),
      funderToken: ctx.ata(funder.publicKey),
      skrMint: ctx.mint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  await ctx.send([ix], [funder]);
}

// `remaining_accounts` carries `(wallet, ata)` pairs in the pool's own
// `top` order (see `settle.rs`) - the ATA is writable (it receives the
// payout and may need creating), the wallet is neither writable nor a
// signer (settle_week is permissionless: only `caller` signs).
export async function settleWeek(
  ctx: Ctx,
  caller: Keypair,
  week: number,
  winners: PublicKey[],
  // Mirrors `backend/src/chain/txs.js`'s `buildSettleWeekTx`, which prepends
  // this same instruction (600_000 units) for exactly the reason a large
  // top-10 settle needs it: up to 10 ATA creations + 10 transfer_checked
  // CPIs + 1 rollover transfer can exceed the default 200_000 CU budget.
  // Left undefined by default so the many small-winner-count tests above
  // keep their original (budget-instruction-free) transaction shape.
  computeUnitLimit?: number
) {
  const weekPool = weekPda(ctx.programId, week);
  const nextWeekPool = weekPda(ctx.programId, week + 1);
  const remainingAccounts: AccountMeta[] = winners.flatMap((wallet) => [
    { pubkey: wallet, isWritable: false, isSigner: false },
    { pubkey: ctx.ata(wallet), isWritable: true, isSigner: false },
  ]);
  const ix = await ctx.program.methods
    .settleWeek(week)
    .accountsPartial({
      caller: caller.publicKey,
      weekPool,
      vault: ctx.ata(weekPool),
      nextWeekPool,
      nextVault: ctx.ata(nextWeekPool),
      skrMint: ctx.mint,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .remainingAccounts(remainingAccounts)
    .instruction();
  const ixs =
    computeUnitLimit === undefined
      ? [ix]
      : [ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }), ix];
  return ctx.send(ixs, [caller]);
}

// `catalog` is a singleton PDA (seeds = [b"catalog"], like `config`), so
// this mirrors `initConfig`'s idempotency: whichever test is first to call
// it performs the real `init_catalog`; every later call confirms the
// existing catalog matches `items` (same as `initConfig` confirms the
// existing config's `skr_mint`) and returns without sending a transaction,
// or throws if it does not - a silent no-op on a mismatched list would let
// a later test run against catalog prices/items it never asked for.
export async function initCatalog(ctx: Ctx, items = CATALOG_ITEMS) {
  const pda = catalogPda(ctx.programId);
  const existing = await ctx.program.account.catalog.fetchNullable(pda);
  if (existing) {
    const matches =
      existing.count === items.length &&
      items.every((it, i) => {
        const e = existing.items[i];
        return (
          e.id === it.id &&
          e.kind === it.kind &&
          e.price.eq(it.price) &&
          e.active === it.active
        );
      });
    if (!matches) {
      throw new Error(
        "catalog already initialized with a different item list - every test file must share the same catalog (see fixtures.ts's initCatalog)"
      );
    }
    return;
  }
  const ix = await ctx.program.methods
    .initCatalog({ items })
    .accountsPartial({ admin: ctx.admin.publicKey })
    .instruction();
  await ctx.send([ix], [ctx.admin]);
}

export async function setCatalog(
  ctx: Ctx,
  items: typeof CATALOG_ITEMS,
  admin: Keypair = ctx.admin
) {
  const ix = await ctx.program.methods
    .setCatalog({ items })
    .accountsPartial({ admin: admin.publicKey })
    .instruction();
  await ctx.send([ix], [admin]);
}

export async function fetchCatalog(ctx: Ctx) {
  return ctx.program.account.catalog.fetch(catalogPda(ctx.programId));
}

// `catalog`'s seeds are constant (`[b"catalog"]`), so - like `config` in
// `buyTicket` above - Anchor's client resolves it on its own; only the
// same non-derivable accounts `buyTicket` must pass explicitly are needed
// here too.
// Returns the transaction signature (like `settleWeek` above) so callers
// can fetch its logs and assert the `ItemPurchased` event payload - see
// `getEvent` below.
export async function purchase(
  ctx: Ctx,
  who: Keypair,
  itemId: number,
  maxPrice: BN,
  week: number
) {
  const weekPool = weekPda(ctx.programId, week);
  const ix = await ctx.program.methods
    .purchase(itemId, maxPrice)
    .accountsPartial({
      wallet: who.publicKey,
      weekPool,
      vault: ctx.ata(weekPool),
      treasury: ctx.treasury,
      walletToken: ctx.ata(who.publicKey),
      skrMint: ctx.mint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  return ctx.send([ix], [who]);
}

// `revive` reuses `buy_ticket`'s account set verbatim (see `tide.rs`), so
// this fixture mirrors `buyTicket` above, plus the `max_price` ceiling
// (mirrors `purchase`'s `maxPrice` argument above). Returns the
// transaction signature, like `purchase` above, so callers can assert the
// `Revived` event payload.
export async function revive(ctx: Ctx, who: Keypair, week: number, maxPrice: BN) {
  const weekPool = weekPda(ctx.programId, week);
  const ix = await ctx.program.methods
    .revive(maxPrice)
    .accountsPartial({
      wallet: who.publicKey,
      weekPool,
      vault: ctx.ata(weekPool),
      treasury: ctx.treasury,
      walletToken: ctx.ata(who.publicKey),
      skrMint: ctx.mint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  return ctx.send([ix], [who]);
}

// Fetches `signature`'s confirmed transaction and decodes the first log
// event named `eventName` (undefined if none matches) - used to assert
// `ItemPurchased`/`Revived` payloads, the backend's interface contract for
// these instructions. `eventName` must be the camelCased form ("itemPurchased",
// "revived") - `program.coder` (built from the auto-camelCased IDL, same as
// every account field, e.g. `tideAt`) decodes and reports event names that
// way too, not the Rust struct's own PascalCase name.
export async function getEvent(
  ctx: Ctx,
  signature: string,
  eventName: string
): Promise<any> {
  const tx = await ctx.connection.getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  const logs = tx?.meta?.logMessages ?? [];
  const parser = new EventParser(ctx.programId, ctx.program.coder);
  for (const event of parser.parseLogs(logs)) {
    if (event.name === eventName) return event.data;
  }
  return undefined;
}
