// The SOL -> SKR swap composition: Jupiter's own instructions and ours in
// ONE v0 transaction the wallet signs once, against the recorded fixture in
// `test/fixtures/jupiter-swap-instructions.json`. Nothing here touches the network: Jupiter is a
// `fetchImpl` stub and the chain is `FakeConnection`, which also serves the route's lookup tables.
import { ComputeBudgetProgram, Keypair, PublicKey, PACKET_DATA_SIZE } from '@solana/web3.js';
import bs58 from 'bs58';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeConnection } from './helpers/fakeConnection.js';
import { decodeTx, instructionsFromMessage } from './helpers/fixtureTx.js';
import { fixtureFetch, jupiterFixture, lookupTableCandidates } from './helpers/jupiterFixture.js';

const serverAuthority = Keypair.generate();
const PROGRAM_ID = Keypair.generate().publicKey.toBase58();
const SKR_MINT = Keypair.generate().publicKey.toBase58();
process.env.SOLANA_CLUSTER = 'mainnet';
process.env.SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
process.env.PROGRAM_ID = PROGRAM_ID;
process.env.SKR_MINT = SKR_MINT;
process.env.SERVER_AUTHORITY_SECRET = bs58.encode(serverAuthority.secretKey);

const { toInstruction, lookupTableAccounts } = await import('../src/chain/jupiter.js');
const { buildPurchaseTx, buildReviveTx } = await import('../src/chain/txs.js');
const { hasPurchase, hasRevive } = await import('../src/chain/verify.js');
const { quoteSwap } = await import('../src/services/swap.js');

const WALLET = Keypair.generate().publicKey.toBase58();
const TREASURY = Keypair.generate().publicKey.toBase58();
const WEEK = 42;
const LIME = 3;
const COMPUTE_BUDGET = 'ComputeBudget111111111111111111111111111111';
const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const JUPITER = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';

const fixture = jupiterFixture(WALLET, SKR_MINT);
const TABLES = fixture.built.addressLookupTableAddresses;

/** A `FakeConnection` whose first lookup table holds every account of the route that one may hold. */
function connectionWithTables() {
  const connection = new FakeConnection();
  connection.setLookupTable(TABLES[0], lookupTableCandidates(fixture.built));
  connection.setLookupTable(TABLES[1], []);
  return connection;
}

/** The swap plan `services/swap.js` hands the builders, straight from the fixture. */
function fixturePlan() {
  return quoteSwap({ outBaseUnits: 10_000_000n, wallet: WALLET, fetchImpl: fixtureFetch(fixture) });
}

/**
 * A swap plan too wide to share a packet with our payment, so the composition must split. `bytes`
 * pads the swap instruction's data and `extraAccounts` widens its account list - the two ways a
 * transaction runs out of room, and they fail differently inside web3.js (a long enough message
 * overruns its 1232-byte encoding buffer outright; a shorter one only pushes the signed
 * transaction past the limit), so both are exercised.
 */
function oversizePlan(bytes = 900, extraAccounts = 0) {
  const accounts = [
    { pubkey: WALLET, isSigner: true, isWritable: true },
    ...Array.from({ length: extraAccounts }, () => ({ pubkey: Keypair.generate().publicKey.toBase58(), isSigner: false, isWritable: true })),
  ];
  return {
    inSol: 0.0019,
    instructions: [
      { programId: COMPUTE_BUDGET, accounts: [], data: Buffer.from([2, 224, 147, 4, 0]).toString('base64') },
      { programId: JUPITER, accounts, data: Buffer.alloc(bytes, 7).toString('base64') },
    ],
    addressLookupTables: [],
  };
}

describe('chain/jupiter.js', () => {
  it('maps Jupiter\'s instruction JSON onto a web3.js instruction (programId, keys, base64 data)', () => {
    const ix = toInstruction(fixture.built.swapInstruction);
    expect(ix.programId.toBase58()).toBe(JUPITER);
    expect(ix.keys).toHaveLength(fixture.built.swapInstruction.accounts.length);
    expect(ix.keys[1]).toEqual({ pubkey: new PublicKey(WALLET), isSigner: true, isWritable: false });
    expect(ix.data.equals(Buffer.from(fixture.built.swapInstruction.data, 'base64'))).toBe(true);
  });

  it('maps an instruction with no accounts (the compute-budget ones) to empty keys', () => {
    const ix = toInstruction(fixture.built.computeBudgetInstructions[0]);
    expect(ix.programId.toBase58()).toBe(COMPUTE_BUDGET);
    expect(ix.keys).toEqual([]);
  });

  it('resolves every lookup table the route names, in order', async () => {
    const tables = await lookupTableAccounts(connectionWithTables(), TABLES);
    expect(tables.map((t) => t.key.toBase58())).toEqual(TABLES);
    expect(tables[0].state.addresses.length).toBeGreaterThan(0);
  });

  it('resolves nothing for an empty list, without asking the RPC', async () => {
    expect(await lookupTableAccounts(new FakeConnection(), [])).toEqual([]);
  });

  it('throws when a lookup table the route names does not exist on chain', async () => {
    await expect(lookupTableAccounts(new FakeConnection(), TABLES)).rejects.toThrow(/lookup table/i);
  });
});

describe('buildPurchaseTx with a swap plan', () => {
  let plan;
  beforeEach(async () => {
    plan = await fixturePlan();
  });

  it('puts Jupiter\'s instructions first, then create_player, then our purchase', async () => {
    const connection = connectionWithTables();
    const built = await buildPurchaseTx(WALLET, { itemId: LIME, maxPrice: 25_000_000n, week: WEEK, treasury: TREASURY, createPlayer: true, swap: plan, connection });
    const tables = await lookupTableAccounts(connection, TABLES);
    const instructions = instructionsFromMessage(decodeTx(built.transaction).message, tables);

    expect(instructions.map((ix) => ix.programId)).toEqual([
      COMPUTE_BUDGET, COMPUTE_BUDGET, ATA_PROGRAM, ATA_PROGRAM, JUPITER, TOKEN_PROGRAM, PROGRAM_ID, PROGRAM_ID,
    ]);
  });

  it('leaves create_player out when the wallet already has a Player account', async () => {
    const connection = connectionWithTables();
    const built = await buildPurchaseTx(WALLET, { itemId: LIME, maxPrice: 25_000_000n, week: WEEK, treasury: TREASURY, createPlayer: false, swap: plan, connection });
    const tables = await lookupTableAccounts(connection, TABLES);
    const instructions = instructionsFromMessage(decodeTx(built.transaction).message, tables);
    expect(instructions.filter((ix) => ix.programId === PROGRAM_ID)).toHaveLength(1);
  });

  it('pays with the wallet: one required signature, the wallet first in the static keys', async () => {
    const built = await buildPurchaseTx(WALLET, { itemId: LIME, maxPrice: 25_000_000n, week: WEEK, treasury: TREASURY, createPlayer: false, swap: plan, connection: connectionWithTables() });
    const message = decodeTx(built.transaction).message;
    expect(message.header.numRequiredSignatures).toBe(1);
    expect(message.staticAccountKeys[0].toBase58()).toBe(WALLET);
  });

  it('actually uses the route\'s address lookup tables', async () => {
    const built = await buildPurchaseTx(WALLET, { itemId: LIME, maxPrice: 25_000_000n, week: WEEK, treasury: TREASURY, createPlayer: false, swap: plan, connection: connectionWithTables() });
    const lookups = decodeTx(built.transaction).message.addressTableLookups;
    expect(lookups.map((l) => l.accountKey.toBase58())).toContain(TABLES[0]);
    expect(lookups.some((l) => l.writableIndexes.length + l.readonlyIndexes.length > 0)).toBe(true);
  });

  it('carries the same blockhash envelope as a plain build', async () => {
    const built = await buildPurchaseTx(WALLET, { itemId: LIME, maxPrice: 25_000_000n, week: WEEK, treasury: TREASURY, createPlayer: false, swap: plan, connection: connectionWithTables() });
    expect(built).toMatchObject({ blockhash: expect.any(String), lastValidBlockHeight: 5678, minContextSlot: 1234 });
    expect(built.transactions).toBeUndefined();
  });

  it('fits one packet with the fixture\'s route', async () => {
    const built = await buildPurchaseTx(WALLET, { itemId: LIME, maxPrice: 25_000_000n, week: WEEK, treasury: TREASURY, createPlayer: true, swap: plan, connection: connectionWithTables() });
    expect(Buffer.from(built.transaction, 'base64').length).toBeLessThanOrEqual(PACKET_DATA_SIZE);
  });

  it('builds the plain single-instruction transaction when no swap is planned', async () => {
    const built = await buildPurchaseTx(WALLET, { itemId: LIME, maxPrice: 25_000_000n, week: WEEK, treasury: TREASURY, createPlayer: false, connection: new FakeConnection() });
    const instructions = instructionsFromMessage(decodeTx(built.transaction).message);
    expect(instructions.map((ix) => ix.programId)).toEqual([PROGRAM_ID]);
  });
});

describe('buildReviveTx with a swap plan', () => {
  it('puts our revive last, after Jupiter\'s instructions', async () => {
    const connection = connectionWithTables();
    const plan = await fixturePlan();
    const built = await buildReviveTx(WALLET, { maxPrice: 25_000_000n, week: WEEK, treasury: TREASURY, createPlayer: false, swap: plan, connection });
    const tables = await lookupTableAccounts(connection, TABLES);
    const instructions = instructionsFromMessage(decodeTx(built.transaction).message, tables);
    expect(instructions.map((ix) => ix.programId)).toEqual([
      COMPUTE_BUDGET, COMPUTE_BUDGET, ATA_PROGRAM, ATA_PROGRAM, JUPITER, TOKEN_PROGRAM, PROGRAM_ID,
    ]);
  });
});

describe('the 1232-byte split', () => {
  it('splits into a swap transaction and a payment transaction, swap first', async () => {
    const built = await buildPurchaseTx(WALLET, { itemId: LIME, maxPrice: 25_000_000n, week: WEEK, treasury: TREASURY, createPlayer: true, swap: oversizePlan(), connection: new FakeConnection() });
    expect(built.transaction).toBeUndefined();
    expect(built.transactions).toHaveLength(2);

    const [swapTx, paymentTx] = built.transactions.map((tx) => instructionsFromMessage(decodeTx(tx).message));
    expect(swapTx.map((ix) => ix.programId)).toEqual([COMPUTE_BUDGET, JUPITER]);
    expect(paymentTx.map((ix) => ix.programId)).toEqual([PROGRAM_ID, PROGRAM_ID]);
  });

  it('keeps both halves inside one packet, both paid for by the wallet', async () => {
    const built = await buildPurchaseTx(WALLET, { itemId: LIME, maxPrice: 25_000_000n, week: WEEK, treasury: TREASURY, createPlayer: true, swap: oversizePlan(), connection: new FakeConnection() });
    for (const tx of built.transactions) {
      expect(Buffer.from(tx, 'base64').length).toBeLessThanOrEqual(PACKET_DATA_SIZE);
      const message = decodeTx(tx).message;
      expect(message.header.numRequiredSignatures).toBe(1);
      expect(message.staticAccountKeys[0].toBase58()).toBe(WALLET);
      expect(message.recentBlockhash).toBe(built.blockhash);
    }
  });

  it('does not split a plan that still fits, even at the edge', async () => {
    // Sized so the composed transaction lands just inside the packet; one byte more splits it.
    const connection = new FakeConnection();
    const fits = await buildPurchaseTx(WALLET, { itemId: LIME, maxPrice: 25_000_000n, week: WEEK, treasury: TREASURY, createPlayer: false, swap: oversizePlan(1), connection });
    expect(fits.transactions).toBeUndefined();
    const size = Buffer.from(fits.transaction, 'base64').length;
    const overBy = PACKET_DATA_SIZE - size + 1;
    const split = await buildPurchaseTx(WALLET, { itemId: LIME, maxPrice: 25_000_000n, week: WEEK, treasury: TREASURY, createPlayer: false, swap: oversizePlan(1 + overBy), connection });
    expect(split.transactions).toHaveLength(2);
  });

  it('splits a route whose composed message overruns the encoder, while each half still fits', async () => {
    const built = await buildPurchaseTx(WALLET, { itemId: LIME, maxPrice: 25_000_000n, week: WEEK, treasury: TREASURY, createPlayer: true, swap: oversizePlan(200, 20), connection: new FakeConnection() });
    expect(built.transactions).toHaveLength(2);
    for (const tx of built.transactions) expect(Buffer.from(tx, 'base64').length).toBeLessThanOrEqual(PACKET_DATA_SIZE);
  });

  it('refuses a route so wide that even its own half cannot be sent', async () => {
    await expect(buildPurchaseTx(WALLET, { itemId: LIME, maxPrice: 25_000_000n, week: WEEK, treasury: TREASURY, createPlayer: false, swap: oversizePlan(1200), connection: new FakeConnection() }))
      .rejects.toThrow(/does not fit/i);
  });

  it('splits a revive the same way', async () => {
    const built = await buildReviveTx(WALLET, { maxPrice: 25_000_000n, week: WEEK, treasury: TREASURY, createPlayer: false, swap: oversizePlan(), connection: new FakeConnection() });
    expect(built.transactions).toHaveLength(2);
    const [, paymentTx] = built.transactions.map((tx) => instructionsFromMessage(decodeTx(tx).message));
    expect(paymentTx.map((ix) => ix.programId)).toEqual([PROGRAM_ID]);
  });
});

describe('the confirm verifier against a swap-composed transaction', () => {
  it('finds our purchase even though Jupiter\'s instructions come first and the keys are looked up', async () => {
    const connection = connectionWithTables();
    const built = await buildPurchaseTx(WALLET, { itemId: LIME, maxPrice: 25_000_000n, week: WEEK, treasury: TREASURY, createPlayer: true, swap: await fixturePlan(), connection });
    const tables = await lookupTableAccounts(connection, TABLES);
    const instructions = instructionsFromMessage(decodeTx(built.transaction).message, tables);
    expect(hasPurchase(instructions, { wallet: WALLET, itemId: LIME })).toBe(true);
    expect(hasPurchase(instructions, { wallet: WALLET, itemId: LIME + 1 })).toBe(false);
  });

  it('finds our revive after Jupiter\'s instructions', async () => {
    const connection = connectionWithTables();
    const built = await buildReviveTx(WALLET, { maxPrice: 25_000_000n, week: WEEK, treasury: TREASURY, createPlayer: false, swap: await fixturePlan(), connection });
    const tables = await lookupTableAccounts(connection, TABLES);
    const instructions = instructionsFromMessage(decodeTx(built.transaction).message, tables);
    expect(hasRevive(instructions, { wallet: WALLET })).toBe(true);
    expect(hasRevive(instructions, { wallet: Keypair.generate().publicKey.toBase58() })).toBe(false);
  });

  it('finds our purchase in the second half of a split, where Jupiter\'s instructions are absent', async () => {
    const built = await buildPurchaseTx(WALLET, { itemId: LIME, maxPrice: 25_000_000n, week: WEEK, treasury: TREASURY, createPlayer: true, swap: oversizePlan(), connection: new FakeConnection() });
    const instructions = instructionsFromMessage(decodeTx(built.transactions[1]).message);
    expect(hasPurchase(instructions, { wallet: WALLET, itemId: LIME })).toBe(true);
  });

  it('rejects a transaction that only swaps and never pays us', async () => {
    const built = await buildPurchaseTx(WALLET, { itemId: LIME, maxPrice: 25_000_000n, week: WEEK, treasury: TREASURY, createPlayer: true, swap: oversizePlan(), connection: new FakeConnection() });
    const instructions = instructionsFromMessage(decodeTx(built.transactions[0]).message);
    expect(hasPurchase(instructions, { wallet: WALLET, itemId: LIME })).toBe(false);
  });

  it('still finds a purchase that is the only instruction (the no-swap path is unchanged)', async () => {
    const built = await buildPurchaseTx(WALLET, { itemId: LIME, maxPrice: 25_000_000n, week: WEEK, treasury: TREASURY, createPlayer: false, connection: new FakeConnection() });
    const instructions = instructionsFromMessage(decodeTx(built.transaction).message);
    expect(hasPurchase(instructions, { wallet: WALLET, itemId: LIME })).toBe(true);
  });

  it('ignores a foreign program\'s instruction that carries our discriminator', async () => {
    const connection = connectionWithTables();
    const plan = await fixturePlan();
    const built = await buildPurchaseTx(WALLET, { itemId: LIME, maxPrice: 25_000_000n, week: WEEK, treasury: TREASURY, createPlayer: false, swap: plan, connection });
    const tables = await lookupTableAccounts(connection, TABLES);
    const instructions = instructionsFromMessage(decodeTx(built.transaction).message, tables);
    const ours = instructions.find((ix) => ix.programId === PROGRAM_ID);
    const impostor = { ...ours, programId: ComputeBudgetProgram.programId.toBase58() };
    expect(hasPurchase([impostor], { wallet: WALLET, itemId: LIME })).toBe(false);
  });
});
