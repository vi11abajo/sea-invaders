import * as fs from "fs";
import * as path from "path";
import { AnchorProvider, BN, Program } from "@anchor-lang/core";
import {
  Connection,
  Keypair,
  PublicKey,
  SendTransactionError,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo as splMintTo,
  TokenAccountNotFoundError,
} from "@solana/spl-token";
import { SeaInvaders } from "../target/types/sea_invaders";

const LAMPORTS_PER_SOL = 1_000_000_000;
const FUNDING_LAMPORTS = 10 * LAMPORTS_PER_SOL;
const MINT_DECIMALS = 6;

export interface Ctx {
  connection: Connection;
  provider: AnchorProvider;
  program: Program<SeaInvaders>;
  programId: PublicKey;
  admin: Keypair;
  server: Keypair;
  alice: Keypair;
  bob: Keypair; // all funded with 10 SOL
  mint: PublicKey; // 6-decimal test token, mint authority = admin
  treasury: PublicKey; // admin's ATA for the mint
  ata(owner: PublicKey): PublicKey; // derived ATA address
  mintTo(owner: PublicKey, amount: bigint): Promise<void>; // creates the ATA if needed, mints amount base units
  tokenBalance(owner: PublicKey): Promise<bigint>; // 0n when the ATA does not exist
  send(
    ixs: TransactionInstruction[],
    signers: Keypair[],
    opts?: { skipPreflight?: boolean }
  ): Promise<string>; // throws Error with the program log on failure; skipPreflight defaults to false
  now(): Promise<number>; // current unix time (the program's clock override, or the validator's real clock)
}

// Exported so other test files that need extra actors beyond alice/bob
// (e.g. settle.test.ts's winners, record.test.ts's top-10 fixture) can
// fund them without each duplicating this - see record.test.ts's former
// `fundActor`, folded into a direct call of this instead.
export async function airdrop(
  connection: Connection,
  pubkey: PublicKey,
  lamports: number
): Promise<void> {
  const signature = await connection.requestAirdrop(pubkey, lamports);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed"
  );
}

// `config` (seeds = [b"config"]) is a singleton PDA on the single
// `solana-test-validator` this harness now shares across every test file in
// the mocha run (unlike the Task 1 LiteSVM harness, where each file got its
// own isolated in-memory VM and could freely `init_config` on its own), and
// it stores `skr_mint`/`treasury`/`server_authority` (`has_one` constraints
// check these on later instructions, e.g. `create_week_pool`). So `admin`,
// `server`, `mint` and `treasury` are all cached at module scope and reused
// by every `setup()` call across every file - only `alice`/`bob` stay fresh
// per call, since they only ever appear in per-wallet PDAs (`player`) that
// must NOT collide between files. `initConfig` (`tests/fixtures.ts`) is
// idempotent, so whichever file's `setup()`/`initConfig()` runs first does
// the one real `init_config`; every other file's call just verifies the
// existing config matches and returns.
let sharedAdmin: Keypair | undefined;
let sharedServer: Keypair | undefined;
let sharedMint: PublicKey | undefined;
let sharedTreasury: PublicKey | undefined;

/** The `config` PDA (seeds = [b"config"]) - a singleton per program. */
export function configPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId
  )[0];
}

export async function setup(): Promise<Ctx> {
  const provider = AnchorProvider.env();
  const connection = provider.connection;

  if (!sharedAdmin) {
    sharedAdmin = Keypair.generate();
  }
  if (!sharedServer) {
    sharedServer = Keypair.generate();
  }
  const admin = sharedAdmin;
  const server = sharedServer;
  const alice = Keypair.generate();
  const bob = Keypair.generate();
  for (const kp of [admin, server, alice, bob]) {
    await airdrop(connection, kp.publicKey, FUNDING_LAMPORTS);
  }

  if (!sharedMint) {
    sharedMint = await createMint(
      connection,
      admin,
      admin.publicKey,
      null,
      MINT_DECIMALS
    );
  }
  const mint = sharedMint;

  if (!sharedTreasury) {
    const treasuryAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      admin,
      mint,
      admin.publicKey
    );
    sharedTreasury = treasuryAccount.address;
  }
  const treasury = sharedTreasury;

  const idlPath = path.join(
    __dirname,
    "..",
    "target",
    "idl",
    "sea_invaders.json"
  );
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const programId = new PublicKey(idl.address);
  const program = new Program<SeaInvaders>(idl, provider);

  const ata = (owner: PublicKey): PublicKey =>
    getAssociatedTokenAddressSync(mint, owner, true);

  const mintToFn = async (owner: PublicKey, amount: bigint): Promise<void> => {
    // Both confirmed explicitly at "confirmed" (the same commitment `send`
    // below simulates and sends at) - otherwise these default to their own,
    // unspecified commitment, and a `send` immediately after `mintTo` can
    // simulate against a snapshot that predates the ATA creation/mint.
    const account = await getOrCreateAssociatedTokenAccount(
      connection,
      admin,
      mint,
      owner,
      true,
      "confirmed",
      { commitment: "confirmed" }
    );
    await splMintTo(
      connection,
      admin,
      mint,
      account.address,
      admin,
      amount,
      [],
      { commitment: "confirmed" }
    );
  };

  const tokenBalance = async (owner: PublicKey): Promise<bigint> => {
    try {
      const account = await getAccount(connection, ata(owner));
      return account.amount;
    } catch (err) {
      if (err instanceof TokenAccountNotFoundError) return 0n;
      throw err;
    }
  };

  const send = async (
    ixs: TransactionInstruction[],
    signers: Keypair[],
    opts?: { skipPreflight?: boolean }
  ): Promise<string> => {
    const tx = new Transaction();
    tx.add(...ixs);
    tx.feePayer = signers[0]?.publicKey;
    const skipPreflight = opts?.skipPreflight ?? false;
    try {
      return await sendAndConfirmTransaction(connection, tx, signers, {
        commitment: "confirmed",
        skipPreflight,
      });
    } catch (err) {
      let logs: string[] | undefined;
      if (err instanceof SendTransactionError) {
        logs = err.logs ?? undefined;
        if (!logs) {
          try {
            logs = await err.getLogs(connection);
          } catch {
            // fall through to the fallbacks below
          }
        }
      }
      const message = err instanceof Error ? err.message : String(err);
      if (!logs) {
        // With `skipPreflight: true`, a transaction that fails during
        // actual execution (rather than at the simulate step preflight
        // would have caught) surfaces as a plain confirmation error -
        // "Transaction <signature> failed ..." - with no attached logs,
        // unlike a `SendTransactionError`. The signature is still in that
        // message, so fetch the now-confirmed (failed) transaction to
        // recover its logs.
        const sigMatch = message.match(/[1-9A-HJ-NP-Za-km-z]{64,}/);
        if (sigMatch) {
          try {
            const confirmed = await connection.getTransaction(sigMatch[0], {
              commitment: "confirmed",
              maxSupportedTransactionVersion: 0,
            });
            logs = confirmed?.meta?.logMessages ?? undefined;
          } catch {
            // fall through to the simulate-based fallback below
          }
        }
      }
      if (!logs) {
        try {
          const sim = await connection.simulateTransaction(tx);
          logs = sim.value.logs ?? undefined;
        } catch {
          // no logs available from any path; the raw error message is
          // still surfaced below
        }
      }
      throw new Error(`${message}\n${(logs ?? []).join("\n")}`);
    }
  };

  const now = async (): Promise<number> => {
    const config = await program.account.config.fetch(configPda(programId));
    const override = Number(config.clockOverride);
    if (override !== 0) return override;
    return await connection.getBlockTime(await connection.getSlot());
  };

  return {
    connection,
    provider,
    program,
    programId,
    admin,
    server,
    alice,
    bob,
    mint,
    treasury,
    ata,
    mintTo: mintToFn,
    tokenBalance,
    send,
    now,
  };
}

export async function warpTo(ctx: Ctx, unixTs: number): Promise<void> {
  const ix = await ctx.program.methods
    .setTestClock(new BN(unixTs))
    .accounts({ admin: ctx.admin.publicKey })
    .instruction();
  await ctx.send([ix], [ctx.admin]);
}
