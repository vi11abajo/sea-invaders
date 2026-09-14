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
import { ComputeBudgetProgram, PACKET_DATA_SIZE, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import { BN } from '@anchor-lang/core';
import { program as buildProgram } from './program.js';
import { connection as defaultConnection } from './connection.js';
import { chainConfig } from './config.js';
import { lookupTableAccounts, toInstruction } from './jupiter.js';
import { catalogPda, configPda, playerPda, weekPda, ata } from './pdas.js';
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

/**
 * `transaction` as base64 if it still fits one 1232-byte packet, `null` if it does not. Two ways to
 * be too big, and both mean the same thing here: web3.js encodes a v0 message into a buffer of
 * exactly `PACKET_DATA_SIZE` and throws `RangeError` once the message alone overruns it, while a
 * message that does fit can still push the whole transaction past the limit once its (here zeroed,
 * but full-length) signature is prepended.
 */
function base64IfItFits(transaction) {
  let serialized;
  try {
    serialized = transaction.serialize();
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
  return serialized.length > PACKET_DATA_SIZE ? null : Buffer.from(serialized).toString('base64');
}

/**
 * `paymentInstructions` paid for by swapping SOL -> SKR first (design doc §5 "Swap"): Jupiter's own
 * instructions - compute budget, setup, swap, cleanup, in the order `services/swap.js` collected
 * them - in front of ours, compiled into ONE v0 message against the route's address lookup tables,
 * fee payer = wallet, so the player signs once.
 *
 * `swap` is `{ instructions, addressLookupTables }` as `quoteSwap` returns it. The whole payment
 * must reach a validator in a single 1232-byte packet (`PACKET_DATA_SIZE`); a route too wide for
 * that even after the lookup tables comes back as `{ transactions: [swapTx, paymentTx] }` instead,
 * two transactions the app signs back to back, swap first - the payment half then pays out of the
 * SKR the swap half just delivered. The size is measured on the serialized transaction, signatures
 * included (zeroed here, the same length once signed), because that is what has to fit the packet.
 */
async function buildWithSwap(connection, walletKey, swap, paymentInstructions) {
  const swapInstructions = (swap.instructions ?? []).map(toInstruction);
  const tables = await lookupTableAccounts(connection, swap.addressLookupTables ?? []);
  const { context, value } = await connection.getLatestBlockhashAndContext();
  const envelope = { blockhash: value.blockhash, lastValidBlockHeight: value.lastValidBlockHeight, minContextSlot: context.slot };
  const compile = (instructions, lookups) => new VersionedTransaction(
    new TransactionMessage({ payerKey: walletKey, recentBlockhash: value.blockhash, instructions }).compileToV0Message(lookups),
  );

  const composed = base64IfItFits(compile([...swapInstructions, ...paymentInstructions], tables));
  if (composed !== null) return { ...envelope, transaction: composed };
  // Our own instructions never touch the route's accounts, so the payment half needs no lookup table.
  const swapOnly = base64IfItFits(compile(swapInstructions, tables));
  const paymentOnly = base64IfItFits(compile(paymentInstructions, []));
  // A route too wide even on its own cannot be paid for at all: say so, rather than letting the
  // encoder's RangeError reach the caller as an unexplained 500. `maxAccounts` in `services/swap.js`
  // is what keeps Jupiter's half this side of the limit.
  if (swapOnly === null || paymentOnly === null) throw new Error('The swap route does not fit a Solana transaction');
  return { ...envelope, transactions: [swapOnly, paymentOnly] };
}

/**
 * Sends an already-signed envelope (as returned by `buildCreateWeekPoolTx` / `buildSettleWeekTx`,
 * both fully signed by the server authority) and waits for confirmation. Every RPC send in the
 * backend goes through this one function so tests can mock it via `chain/txs.js`.
 */
export async function sendSigned(prepared, { connection = defaultConnection() } = {}) {
  const raw = Buffer.from(prepared.transaction, 'base64');
  const signature = await connection.sendRawTransaction(raw, { skipPreflight: false });
  await connection.confirmTransaction(
    { signature, blockhash: prepared.blockhash, lastValidBlockHeight: prepared.lastValidBlockHeight },
    'confirmed',
  );
  return signature;
}

/** `create_player`: initializes the caller's `Player` account. Unsigned; fee payer = wallet. */
export async function buildCreatePlayerTx(wallet, { connection = defaultConnection() } = {}) {
  const walletKey = toPublicKey(wallet);
  const ix = await createPlayerInstruction(connection, walletKey);
  return finalize(await buildEnvelope(connection, walletKey, [ix]));
}

/** `buy_ticket`. Unsigned; fee payer = wallet. `treasury` may be passed in to skip the `getConfig` round trip. */
export async function buildBuyTicketTx(wallet, { week, treasury, connection = defaultConnection() } = {}) {
  const walletKey = toPublicKey(wallet);
  const ix = await buyTicketLikeInstruction(connection, 'buyTicket', walletKey, { week, treasury });
  return finalize(await buildEnvelope(connection, walletKey, [ix]));
}

/**
 * Builds an instruction for any method reusing the `BuyTicket` account set (`wallet`, `config`,
 * `player`, `week_pool`, `vault`, `treasury`, `wallet_token`, `skr_mint`, `token_program`) with no
 * args - `buy_ticket` and `revive` both do (see `instructions/tide.rs`).
 */
async function buyTicketLikeInstruction(connection, methodName, walletKey, { week, treasury }, args = []) {
  const { skrMint } = chainConfig();
  const treasuryKey = treasury ? toPublicKey(treasury) : toPublicKey((await getConfig(connection)).treasury);
  const weekPoolKey = weekPda(week);
  return buildProgram(connection)
    .methods[methodName](...args)
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
}

async function createPlayerInstruction(connection, walletKey) {
  return buildProgram(connection)
    .methods.createPlayer()
    .accountsPartial({
      wallet: walletKey,
      player: playerPda(walletKey),
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

/**
 * `create_player` (when `createPlayer` is true) + `buy_ticket`, composed into one v0 tx so a
 * first-time buyer only signs once. Unsigned; fee payer = wallet.
 */
export async function buildTicketTx(wallet, { createPlayer, week, treasury, connection = defaultConnection() } = {}) {
  const walletKey = toPublicKey(wallet);
  const instructions = [];
  if (createPlayer) instructions.push(await createPlayerInstruction(connection, walletKey));
  instructions.push(await buyTicketLikeInstruction(connection, 'buyTicket', walletKey, { week, treasury }));
  return finalize(await buildEnvelope(connection, walletKey, instructions));
}

/**
 * `create_player` (when `createPlayer` is true) + `purchase(item_id, max_price)`, composed into one
 * v0 tx so a first-time buyer only signs once - both `purchase` and `revive` declare
 * `player: Account<'info, Player>` with `has_one = wallet`, so a wallet with no `Player` PDA yet
 * would otherwise fail on chain after paying the fee (`shop.rs`'s `Purchase`, `ticket.rs`'s
 * `BuyTicket` which `revive` reuses) - exactly the gap `buildTicketTx` already closes for tickets.
 * Unsigned; fee payer = wallet. `treasury` may be passed in to skip the `getConfig` round trip.
 * With a `swap` plan (`quoteSwap`'s `{ instructions, addressLookupTables }`) Jupiter's SOL -> SKR
 * instructions go in front of both, through `buildWithSwap`.
 */
export async function buildPurchaseTx(wallet, { itemId, maxPrice, week, treasury, createPlayer, swap = null, connection = defaultConnection() } = {}) {
  const walletKey = toPublicKey(wallet);
  const { skrMint } = chainConfig();
  const treasuryKey = treasury ? toPublicKey(treasury) : toPublicKey((await getConfig(connection)).treasury);
  const weekPoolKey = weekPda(week);
  const ix = await buildProgram(connection)
    .methods.purchase(itemId, new BN(maxPrice.toString()))
    .accountsPartial({
      wallet: walletKey,
      config: configPda(),
      player: playerPda(walletKey),
      catalog: catalogPda(),
      weekPool: weekPoolKey,
      vault: ata(weekPoolKey, skrMint),
      treasury: treasuryKey,
      walletToken: ata(walletKey, skrMint),
      skrMint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  const instructions = [];
  if (createPlayer) instructions.push(await createPlayerInstruction(connection, walletKey));
  instructions.push(ix);
  if (swap) return buildWithSwap(connection, walletKey, swap, instructions);
  return finalize(await buildEnvelope(connection, walletKey, instructions));
}

/**
 * `create_player` (when `createPlayer` is true) + `revive(max_price)`, composed the same way
 * `buildPurchaseTx` composes `create_player` + `purchase` - `revive` reuses `buy_ticket`'s account set
 * (no catalog), see `instructions/tide.rs`. `maxPrice` (base units, bigint) is the price the player
 * was quoted: the program refuses with `PriceChanged` if the ladder charges more by the time the
 * transaction lands. Unsigned; fee payer = wallet. A `swap` plan goes in front of both, exactly as it
 * does for a purchase.
 */
export async function buildReviveTx(wallet, { week, treasury, maxPrice, createPlayer, swap = null, connection = defaultConnection() } = {}) {
  if (typeof maxPrice !== 'bigint') throw new TypeError('buildReviveTx needs maxPrice in base units (bigint)');
  const walletKey = toPublicKey(wallet);
  const ix = await buyTicketLikeInstruction(connection, 'revive', walletKey, { week, treasury }, [new BN(maxPrice.toString())]);
  const instructions = [];
  if (createPlayer) instructions.push(await createPlayerInstruction(connection, walletKey));
  instructions.push(ix);
  if (swap) return buildWithSwap(connection, walletKey, swap, instructions);
  return finalize(await buildEnvelope(connection, walletKey, instructions));
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
  // Up to 10 ATA creations + 10 transfer_checked CPIs + 1 rollover transfer can exceed the
  // default 200_000 CU budget - see the ten-winner test in programs/tests/settle.test.ts for
  // the measured cost. Cheap insurance either way: it only raises the ceiling, it does not
  // spend more than the transaction actually consumes.
  const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 });
  const envelope = await buildEnvelope(connection, serverAuthority.publicKey, [computeBudgetIx, ix]);
  envelope.transaction.sign([serverAuthority]);
  return finalize(envelope);
}

/**
 * Devnet-only faucet: mints `amount` base units of the test SKR mint to `wallet`'s ATA, creating
 * it if needed. The test mint's mint authority is the server authority, so this needs no admin key.
 */
export async function mintTestTokens(wallet, amount, { connection = defaultConnection() } = {}) {
  const walletKey = toPublicKey(wallet);
  const { skrMint, serverAuthority } = chainConfig();
  // getOrCreateAssociatedTokenAccount swallows any failure of its own create transaction (an
  // unfunded server key, an RPC error, ...) and then throws TokenAccountNotFoundError on the
  // re-read that follows it - that error means the create transaction never landed, not that
  // it landed but isn't visible yet. 'confirmed' here only avoids a separate, unrelated race:
  // the re-read would otherwise run at the connection's default (finalized) commitment, which
  // can lag behind a create transaction that DID land.
  const destination = await getOrCreateAssociatedTokenAccount(
    connection, serverAuthority, skrMint, walletKey, true, 'confirmed', { commitment: 'confirmed' },
  );
  const signature = await mintTo(
    connection, serverAuthority, skrMint, destination.address, serverAuthority, amount, [], { commitment: 'confirmed' },
  );
  return { signature };
}
