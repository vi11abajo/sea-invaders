// Transaction builders. Every builder compiles a v0 message against a fixed
// blockhash/slot from `connection.getLatestBlockhashAndContext()` and
// returns `{ transaction: <base64 VersionedTransaction>, blockhash,
// lastValidBlockHeight, minContextSlot }`.
//
// Fee payer / signing split:
//  - `buildCreatePlayerTx` and `buildBuyTicketTx` are wallet-initiated: fee
//    payer is the wallet, and the transaction comes back unsigned for the
//    wallet (app) to sign and submit.
//  - `buildSubmitDailyBestTx` is dual-signed: fee payer is the wallet, and
//    the server partial-signs its own `server_authority` slot before the
//    wallet ever sees it (the wallet's slot stays zeroed).
//  - `buildCreateWeekPoolTx` and `buildSettleWeekTx` are backend-maintenance
//    instructions with no player wallet involved: fee payer is the server
//    authority, which fully signs before the caller sends it.
import { PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { program as buildProgram } from './program.js';
import { connection as defaultConnection } from './connection.js';
import { chainConfig } from './config.js';
import { configPda, playerPda, weekPda, ata } from './pdas.js';
import { getConfig } from './readers.js';
import { weekOf } from '../services/dailySeed.js';

function toPublicKey(value) {
  return value instanceof PublicKey ? value : new PublicKey(value);
}

async function buildEnvelope(connection, payerKey, instructions) {
  const { context, value } = await connection.getLatestBlockhashAndContext();
  const message = new TransactionMessage({
    payerKey,
    recentBlockhash: value.blockhash,
    instructions,
  }).compileToV0Message();
  return {
    transaction: new VersionedTransaction(message),
    blockhash: value.blockhash,
    lastValidBlockHeight: value.lastValidBlockHeight,
    minContextSlot: context.slot,
  };
}

function finalize(envelope) {
  return { ...envelope, transaction: Buffer.from(envelope.transaction.serialize()).toString('base64') };
}

/** `create_player`: initializes the caller's `Player` account. Unsigned; fee payer = wallet. */
export async function buildCreatePlayerTx(wallet, { connection = defaultConnection() } = {}) {
  const walletKey = toPublicKey(wallet);
  const ix = await buildProgram(connection)
    .methods.createPlayer()
    .accountsPartial({
      wallet: walletKey,
      player: playerPda(walletKey),
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return finalize(await buildEnvelope(connection, walletKey, [ix]));
}

/** `buy_ticket`. Unsigned; fee payer = wallet. `treasury` may be passed in to skip the `getConfig` round trip. */
export async function buildBuyTicketTx(wallet, { week, treasury, connection = defaultConnection() } = {}) {
  const walletKey = toPublicKey(wallet);
  const { skrMint } = chainConfig();
  const treasuryKey = treasury ? toPublicKey(treasury) : toPublicKey((await getConfig(connection)).treasury);
  const weekPoolKey = weekPda(week);
  const ix = await buildProgram(connection)
    .methods.buyTicket()
    .accountsPartial({
      wallet: walletKey,
      config: configPda(),
      player: playerPda(walletKey),
      weekPool: weekPoolKey,
      vault: ata(weekPoolKey, skrMint),
      treasury: treasuryKey,
      walletToken: ata(walletKey, skrMint),
      skrMint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  return finalize(await buildEnvelope(connection, walletKey, [ix]));
}

/** `submit_daily_best`. Dual-signed: the server partial-signs here; the wallet's own signature is left for the app. */
export async function buildSubmitDailyBestTx(wallet, { day, score, replayHash, connection = defaultConnection() } = {}) {
  const walletKey = toPublicKey(wallet);
  const { serverAuthority } = chainConfig();
  const week = weekOf(day);
  const ix = await buildProgram(connection)
    .methods.submitDailyBest(day, score, Array.from(replayHash))
    .accountsPartial({
      wallet: walletKey,
      serverAuthority: serverAuthority.publicKey,
      config: configPda(),
      player: playerPda(walletKey),
      weekPool: weekPda(week),
    })
    .instruction();
  const envelope = await buildEnvelope(connection, walletKey, [ix]);
  envelope.transaction.sign([serverAuthority]);
  return finalize(envelope);
}

/** `create_week_pool`. Backend-only maintenance instruction: fee payer = server authority, fully signed. */
export async function buildCreateWeekPoolTx(week, { connection = defaultConnection() } = {}) {
  const { skrMint, serverAuthority } = chainConfig();
  const weekPoolKey = weekPda(week);
  const ix = await buildProgram(connection)
    .methods.createWeekPool(week)
    .accountsPartial({
      payer: serverAuthority.publicKey,
      config: configPda(),
      skrMint,
      weekPool: weekPoolKey,
      vault: ata(weekPoolKey, skrMint),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  const envelope = await buildEnvelope(connection, serverAuthority.publicKey, [ix]);
  envelope.transaction.sign([serverAuthority]);
  return finalize(envelope);
}

/**
 * `settle_week`. Backend-only maintenance instruction: fee payer = server
 * authority, fully signed. `winners` is the week pool's own `top` list, in
 * order (wallets as `PublicKey` or base58 string) - the program checks each
 * `(wallet, ata)` pair against `week_pool.top[i]` and fails `WinnerMismatch`
 * on a wrong order or a foreign wallet/ATA.
 */
export async function buildSettleWeekTx(week, winners, { connection = defaultConnection() } = {}) {
  const { skrMint, serverAuthority } = chainConfig();
  const weekPoolKey = weekPda(week);
  const nextWeekPoolKey = weekPda(week + 1);
  const remainingAccounts = winners.flatMap((winner) => {
    const walletKey = toPublicKey(winner);
    return [
      { pubkey: walletKey, isSigner: false, isWritable: false },
      { pubkey: ata(walletKey, skrMint), isSigner: false, isWritable: true },
    ];
  });
  const ix = await buildProgram(connection)
    .methods.settleWeek(week)
    .accountsPartial({
      caller: serverAuthority.publicKey,
      config: configPda(),
      weekPool: weekPoolKey,
      vault: ata(weekPoolKey, skrMint),
      nextWeekPool: nextWeekPoolKey,
      nextVault: ata(nextWeekPoolKey, skrMint),
      skrMint,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(remainingAccounts)
    .instruction();
  const envelope = await buildEnvelope(connection, serverAuthority.publicKey, [ix]);
  envelope.transaction.sign([serverAuthority]);
  return finalize(envelope);
}
