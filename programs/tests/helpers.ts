import * as fs from "fs";
import * as path from "path";
import { AnchorProvider, Program } from "@anchor-lang/core";
import type Provider from "@anchor-lang/core/dist/cjs/provider";
import {
  AccountInfo,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  unpackAccount,
} from "@solana/spl-token";
import { SystemProgram } from "@solana/web3.js";
import { FailedTransactionMetadata, LiteSVM } from "litesvm";
import bs58 from "bs58";
import { SeaInvaders } from "../target/types/sea_invaders";

const LAMPORTS_PER_SOL = 1_000_000_000n;
const FUNDING_LAMPORTS = 10n * LAMPORTS_PER_SOL;
const MINT_DECIMALS = 6;

export interface Ctx {
  svm: LiteSVM; // the VM
  program: Program<SeaInvaders>; // @anchor-lang/core Program bound to a LiteSVM-backed provider
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
  now(): number; // current unix time in the VM clock
}

/**
 * A minimal `Provider` (see `@anchor-lang/core`) backed directly by a LiteSVM
 * instance instead of a real RPC connection. It exists so `program.methods
 * .<ix>(...).accounts({...}).instruction()` works (pure IDL/borsh encoding,
 * no network access) and so `program.provider.connection.getAccountInfo`
 * resolves against the VM's account store, which Anchor's account resolver
 * (e.g. for `init_if_needed`) may call while building instructions.
 *
 * Actual transaction submission in these tests goes through `Ctx.send`,
 * which talks to `svm` directly - `sendAndConfirm` below is provided for
 * completeness (e.g. if a later task prefers `program.methods(...).rpc()`)
 * and is not exercised by the Task 1 harness test.
 */
class LiteSVMProvider implements Provider {
  readonly connection: Connection;
  readonly publicKey: PublicKey;

  constructor(
    private readonly svm: LiteSVM,
    wallet: Keypair
  ) {
    this.publicKey = wallet.publicKey;
    this.connection = {
      rpcEndpoint: "litesvm",
      getAccountInfo: async (pubkey: PublicKey) => {
        const info = svm.getAccount(pubkey);
        if (!info) return null;
        return {
          ...info,
          data: Buffer.from(info.data),
        } as AccountInfo<Buffer>;
      },
      getMinimumBalanceForRentExemption: async (dataLength: number) =>
        Number(svm.minimumBalanceForRentExemption(BigInt(dataLength))),
      getLatestBlockhash: async () => ({
        blockhash: svm.latestBlockhash(),
        lastValidBlockHeight: 0,
      }),
      getBalance: async (pubkey: PublicKey) => Number(svm.getBalance(pubkey) ?? 0n),
    } as unknown as Connection;
  }

  async sendAndConfirm(
    tx: Transaction,
    signers: Keypair[] = []
  ): Promise<string> {
    return submit(this.svm, tx, signers);
  }
}

function submit(svm: LiteSVM, tx: Transaction, signers: Keypair[]): string {
  tx.recentBlockhash = svm.latestBlockhash();
  if (!tx.feePayer) {
    tx.feePayer = signers[0]?.publicKey;
  }
  if (signers.length > 0) {
    tx.sign(...signers);
  }
  const result = svm.sendTransaction(tx);
  if (result instanceof FailedTransactionMetadata) {
    throw new Error(result.err().toString() + "\n" + result.meta().logs().join("\n"));
  }
  return bs58.encode(Buffer.from(result.signature()));
}

export async function setup(): Promise<Ctx> {
  const svm = new LiteSVM();

  const idlPath = path.join(__dirname, "..", "target", "idl", "sea_invaders.json");
  const soPath = path.join(__dirname, "..", "target", "deploy", "sea_invaders.so");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const programId = new PublicKey(idl.address);
  svm.addProgramFromFile(programId, soPath);

  const admin = Keypair.generate();
  const server = Keypair.generate();
  const alice = Keypair.generate();
  const bob = Keypair.generate();
  for (const kp of [admin, server, alice, bob]) {
    svm.airdrop(kp.publicKey, FUNDING_LAMPORTS);
  }

  // Create the 6-decimal test mint, authority = admin.
  const mintKeypair = Keypair.generate();
  const mintRent = svm.minimumBalanceForRentExemption(BigInt(MINT_SIZE));
  const createMintTx = new Transaction();
  createMintTx.feePayer = admin.publicKey;
  createMintTx.add(
    SystemProgram.createAccount({
      fromPubkey: admin.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: MINT_SIZE,
      lamports: Number(mintRent),
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(
      mintKeypair.publicKey,
      MINT_DECIMALS,
      admin.publicKey,
      null
    )
  );
  submit(svm, createMintTx, [admin, mintKeypair]);
  const mint = mintKeypair.publicKey;

  // admin's own ATA for the mint, used as the treasury.
  const treasury = getAssociatedTokenAddressSync(mint, admin.publicKey, true);
  const createTreasuryTx = new Transaction();
  createTreasuryTx.feePayer = admin.publicKey;
  createTreasuryTx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      admin.publicKey,
      treasury,
      admin.publicKey,
      mint
    )
  );
  submit(svm, createTreasuryTx, [admin]);

  const provider = new LiteSVMProvider(svm, admin);
  const program = new Program<SeaInvaders>(idl, provider as unknown as AnchorProvider);

  const ata = (owner: PublicKey): PublicKey =>
    getAssociatedTokenAddressSync(mint, owner, true);

  const mintTo = async (owner: PublicKey, amount: bigint): Promise<void> => {
    const ataAddress = ata(owner);
    const tx = new Transaction();
    tx.feePayer = admin.publicKey;
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        admin.publicKey,
        ataAddress,
        owner,
        mint
      ),
      createMintToInstruction(mint, ataAddress, admin.publicKey, amount)
    );
    submit(svm, tx, [admin]);
  };

  const tokenBalance = async (owner: PublicKey): Promise<bigint> => {
    const ataAddress = ata(owner);
    const info = svm.getAccount(ataAddress);
    if (!info) return 0n;
    const accountInfo = {
      ...info,
      data: Buffer.from(info.data),
    } as AccountInfo<Buffer>;
    const decoded = unpackAccount(ataAddress, accountInfo, TOKEN_PROGRAM_ID);
    return decoded.amount;
  };

  const send = async (
    ixs: TransactionInstruction[],
    signers: Keypair[]
  ): Promise<string> => {
    const tx = new Transaction();
    tx.add(...ixs);
    return submit(svm, tx, signers);
  };

  const now = (): number => Number(svm.getClock().unixTimestamp);

  return {
    svm,
    program,
    programId,
    admin,
    server,
    alice,
    bob,
    mint,
    treasury,
    ata,
    mintTo,
    tokenBalance,
    send,
    now,
  };
}

export function warpTo(ctx: Ctx, unixTs: number): void {
  const clock = ctx.svm.getClock();
  clock.unixTimestamp = BigInt(unixTs);
  ctx.svm.setClock(clock);
}
