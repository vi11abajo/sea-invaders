import {
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SendTransactionError,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
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

// `ctx.send` (helpers.ts) always sends with `skipPreflight: false`. On this
// local validator that preflight simulation can - observed only for a
// `buyTicket` sent immediately after the `mintTo`/`getOrCreateAssociated-
// TokenAccount` transactions that fund `wallet_token` - simulate against a
// stale, pre-mint (zero) balance and fail with the SPL "insufficient
// funds" error, even though a plain `getAccountInfo` at the very same
// "confirmed" commitment already shows the minted balance (verified by
// dumping the raw account bytes at the point of failure); one more
// confirmed transaction in between is enough real time for the stale view
// to catch up. The actual bank a transaction executes against (as opposed
// to the RPC's simulate snapshot) always reflects every previously
// confirmed write on a single-node validator, so sending `buyTicket` with
// `skipPreflight: true` sidesteps the race entirely rather than papering
// over it with a delay. This mirrors `ctx.send`'s own error handling
// (helpers.ts) so failures still carry the on-chain logs/program error
// text (`WrongWeekPool`, "insufficient funds", `Paused`) the tests assert
// on.
async function sendSkippingPreflight(
  ctx: Ctx,
  ixs: TransactionInstruction[],
  signers: Keypair[]
): Promise<string> {
  const tx = new Transaction();
  tx.add(...ixs);
  tx.feePayer = signers[0]?.publicKey;
  try {
    return await sendAndConfirmTransaction(ctx.connection, tx, signers, {
      commitment: "confirmed",
      skipPreflight: true,
    });
  } catch (err) {
    let logs: string[] | undefined;
    if (err instanceof SendTransactionError) {
      logs = err.logs ?? undefined;
      if (!logs) {
        try {
          logs = await err.getLogs(ctx.connection);
        } catch {
          // no logs available; the raw error message is still surfaced
        }
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    if (!logs) {
      // With `skipPreflight: true` a transaction that fails during actual
      // execution (rather than at the simulate step `ctx.send` would have
      // caught) surfaces as a plain confirmation error - "Transaction
      // <signature> failed ..." - with no attached logs, unlike a
      // `SendTransactionError`. The signature is still in that message, so
      // fetch the now-confirmed (failed) transaction to recover its logs.
      const sigMatch = message.match(/[1-9A-HJ-NP-Za-km-z]{64,}/);
      if (sigMatch) {
        try {
          const tx = await ctx.connection.getTransaction(sigMatch[0], {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          });
          logs = tx?.meta?.logMessages ?? undefined;
        } catch {
          // no logs available; the raw error message is still surfaced
        }
      }
    }
    throw new Error(`${message}\n${(logs ?? []).join("\n")}`);
  }
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
  await sendSkippingPreflight(ctx, [ix], [who]);
}

export async function fetchPlayer(ctx: Ctx, who: Keypair) {
  return ctx.program.account.player.fetch(
    playerPda(ctx.programId, who.publicKey)
  );
}
