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
  send(ixs: TransactionInstruction[], signers: Keypair[]): Promise<string>; // throws Error with the program log on failure
  now(): Promise<number>; // current unix time (the program's clock override, or the validator's real clock)
}

async function airdrop(
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
// own isolated in-memory VM and could freely `init_config` on its own). Only
// one admin keypair can ever own that PDA for the life of the process, so
// `admin` is cached at module scope and reused by every `setup()` call
// (across files), while every other actor (server/alice/bob) and the mint
// stay fresh per call so per-file PDAs (player, week pool) and token
// balances remain collision-free. `config.test.ts` performs the one real
// `init_config` (mocha loads `tests/**/*.ts` alphabetically, so it always
// runs before `smoke.test.ts`); `smoke.test.ts`'s clock test only calls the
// already-gated `set_test_clock`, which requires that `admin` to match.
let sharedAdmin: Keypair | undefined;

export async function setup(): Promise<Ctx> {
  const provider = AnchorProvider.env();
  const connection = provider.connection;

  if (!sharedAdmin) {
    sharedAdmin = Keypair.generate();
  }
  const admin = sharedAdmin;
  const server = Keypair.generate();
  const alice = Keypair.generate();
  const bob = Keypair.generate();
  for (const kp of [admin, server, alice, bob]) {
    await airdrop(connection, kp.publicKey, FUNDING_LAMPORTS);
  }

  const mint = await createMint(
    connection,
    admin,
    admin.publicKey,
    null,
    MINT_DECIMALS
  );
  const treasuryAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    admin,
    mint,
    admin.publicKey
  );
  const treasury = treasuryAccount.address;

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
    const account = await getOrCreateAssociatedTokenAccount(
      connection,
      admin,
      mint,
      owner,
      true
    );
    await splMintTo(connection, admin, mint, account.address, admin, amount);
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
    signers: Keypair[]
  ): Promise<string> => {
    const tx = new Transaction();
    tx.add(...ixs);
    tx.feePayer = signers[0]?.publicKey;
    try {
      return await sendAndConfirmTransaction(connection, tx, signers, {
        commitment: "confirmed",
        skipPreflight: false,
      });
    } catch (err) {
      let logs: string[] | undefined;
      if (err instanceof SendTransactionError) {
        logs = err.logs ?? undefined;
        if (!logs) {
          try {
            logs = await err.getLogs(connection);
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
          // no logs available from either path; the raw error message is
          // still surfaced below
        }
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`${message}\n${(logs ?? []).join("\n")}`);
    }
  };

  const configPda = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId
  )[0];

  const now = async (): Promise<number> => {
    const config = await program.account.config.fetch(configPda);
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
