import { PublicKey, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BN } from "@anchor-lang/core";
import { configPda, Ctx } from "./helpers";

// Re-exported so existing imports of `configPda` from "./fixtures" (e.g.
// config.test.ts) keep working - the PDA derivation itself lives in
// helpers.ts (see the comment above `sharedAdmin` there) so `now()` can use
// it too without fixtures.ts and helpers.ts importing each other both ways.
export { configPda };

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
  const ix = await ctx.program.methods
    .initConfig(configArgs(ctx))
    .accounts({ admin: ctx.admin.publicKey, skrMint: ctx.mint })
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
