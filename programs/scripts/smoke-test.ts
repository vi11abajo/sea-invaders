/**
 * Devnet smoke test (Phase 2B Task 6, Step 6).
 *
 * Mints 100 test SKR (100_000_000 base units, 6 decimals) to a throwaway
 * keypair - generated in memory only, never written to disk, so there is
 * nothing left to "delete" once the script exits - using the server
 * authority as mint authority (the controller ruling: the backend faucet
 * mints with the server key, never the admin key). Then it calls
 * `createPlayer` and `buyTicket` for that throwaway wallet against the
 * current week's pool, and asserts:
 *   - `Player.attemptsBought === 3`  (one ticket at attemptsPerTicket=3)
 *   - the week pool's vault balance increases by exactly 9_500_000
 *     (10 SKR split 9500/500 bps) - a delta, not an absolute value, since
 *     the vault is shared across every run of this script this week.
 *
 * Prerequisites: `devnet-init.ts` and `create-week-pools.ts` must have run
 * already (Config and the current week's WeekPool must exist).
 *
 * Run from `programs/`:
 *   npx ts-node scripts/smoke-test.ts
 *   (or `npm run devnet:smoke`)
 *
 * Env:
 *   KEYS_DIR             default /mnt/d/dev/keys - reads admin.json and
 *                        server-authority.json.
 *   ANCHOR_PROVIDER_URL  default https://api.devnet.solana.com
 */
import * as fs from "fs";
import * as path from "path";
import { AnchorProvider, Program, Wallet } from "@anchor-lang/core";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { SeaInvaders } from "../target/types/sea_invaders";

const KEYS_DIR = process.env.KEYS_DIR ?? "/mnt/d/dev/keys";
const RPC_URL =
  process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";

// Enough to cover the `player` PDA's rent-exempt minimum plus a couple of
// transaction fees; devnet SOL has no value and this is never reclaimed.
const THROWAWAY_FUNDING_LAMPORTS = 20_000_000; // 0.02 SOL

function loadKeypair(filename: string): Keypair {
  const raw = JSON.parse(
    fs.readFileSync(path.join(KEYS_DIR, filename), "utf8")
  );
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function configPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId
  )[0];
}

function playerPda(programId: PublicKey, wallet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("player"), wallet.toBuffer()],
    programId
  )[0];
}

function weekPda(programId: PublicKey, week: number): PublicKey {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(week);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("week"), buf],
    programId
  )[0];
}

async function main() {
  const admin = loadKeypair("admin.json");
  const serverAuthority = loadKeypair("server-authority.json");
  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new AnchorProvider(
    connection,
    new Wallet(admin),
    AnchorProvider.defaultOptions()
  );

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

  const config = await program.account.config.fetchNullable(
    configPda(programId)
  );
  if (!config) {
    throw new Error("Config not found - run devnet-init.ts first.");
  }
  const skrMint = config.skrMint as PublicKey;
  const treasury = config.treasury as PublicKey;

  const slot = await connection.getSlot();
  const blockTime = await connection.getBlockTime(slot);
  if (blockTime === null) {
    throw new Error("getBlockTime returned null for the current slot.");
  }
  const day = Math.floor(blockTime / 86400);
  const week = Math.floor((day + 3) / 7);
  const weekPool = weekPda(programId, week);
  const existingPool = await program.account.weekPool.fetchNullable(weekPool);
  if (!existingPool) {
    throw new Error(
      `WeekPool(${week}) not found - run create-week-pools.ts first.`
    );
  }

  console.log(
    "Generating a throwaway keypair (in memory only, never written to disk)..."
  );
  const throwaway = Keypair.generate();

  console.log(
    `Funding the throwaway with ${
      THROWAWAY_FUNDING_LAMPORTS / 1e9
    } SOL from admin...`
  );
  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: admin.publicKey,
      toPubkey: throwaway.publicKey,
      lamports: THROWAWAY_FUNDING_LAMPORTS,
    })
  );
  await provider.sendAndConfirm(fundTx, [admin]);

  console.log(
    "Creating the throwaway's ATA and minting 100 test SKR (mint authority = server authority)..."
  );
  const throwawayAta = await getOrCreateAssociatedTokenAccount(
    connection,
    admin,
    skrMint,
    throwaway.publicKey
  );
  await mintTo(
    connection,
    admin,
    skrMint,
    throwawayAta.address,
    serverAuthority,
    100_000_000
  );

  console.log("createPlayer...");
  await program.methods
    .createPlayer()
    .accounts({ wallet: throwaway.publicKey })
    .signers([throwaway])
    .rpc();

  console.log(`buyTicket (week ${week})...`);
  const vault = getAssociatedTokenAddressSync(skrMint, weekPool, true);
  // The vault is the shared week pool, so re-running this smoke test adds
  // another 9_500_000 on top of whatever earlier runs left there - assert
  // the delta buyTicket adds, not an absolute balance, so the check stays
  // correct however many times the script has already run this week.
  const vaultBefore = (await getAccount(connection, vault)).amount;
  await program.methods
    .buyTicket()
    .accountsPartial({
      wallet: throwaway.publicKey,
      weekPool,
      vault,
      treasury,
      walletToken: throwawayAta.address,
      skrMint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([throwaway])
    .rpc();

  // The public devnet RPC endpoint load-balances across multiple backend
  // nodes, which can briefly disagree on the latest confirmed state right
  // after a transaction - a `fetch`/`getAccount` immediately after `.rpc()`
  // resolves can land on a node that has not caught up yet. Retry briefly
  // rather than reporting a false failure.
  let player:
    | Awaited<ReturnType<typeof program.account.player.fetch>>
    | undefined;
  let vaultAccount: Awaited<ReturnType<typeof getAccount>> | undefined;
  let vaultDelta = BigInt(0);
  for (let attempt = 0; attempt < 10; attempt++) {
    player = await program.account.player.fetch(
      playerPda(programId, throwaway.publicKey)
    );
    vaultAccount = await getAccount(connection, vault);
    vaultDelta = vaultAccount.amount - vaultBefore;
    if (player.attemptsBought === 3 && vaultDelta === BigInt(9_500_000)) break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (!player || !vaultAccount) {
    throw new Error("Smoke test failed: could not fetch player/vault state.");
  }

  console.log(`Player.attemptsBought = ${player.attemptsBought} (expected 3)`);
  console.log(
    `Vault balance += ${vaultDelta} (expected 9500000), now ${vaultAccount.amount}`
  );

  if (player.attemptsBought !== 3) {
    throw new Error(
      `Smoke test failed: attemptsBought=${player.attemptsBought}, expected 3`
    );
  }
  if (vaultDelta !== BigInt(9_500_000)) {
    throw new Error(
      `Smoke test failed: vault delta=${vaultDelta}, expected 9500000`
    );
  }

  console.log("Smoke test PASSED.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
