import { createHash } from 'node:crypto';
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { AccountLayout, ACCOUNT_SIZE, AccountState, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { BN } from '@anchor-lang/core';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeConnection } from './helpers/fakeConnection.js';

// chainConfig()/validateChainConfig() and everything downstream read
// `process.env` live, so tests can just set it up-front - a random program
// id (the IDL's own `address` is overridden by `PROGRAM_ID`), a random SKR
// mint, and a freshly generated server keypair.
const serverAuthority = Keypair.generate();
process.env.SOLANA_CLUSTER = 'devnet';
process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
process.env.PROGRAM_ID = Keypair.generate().publicKey.toBase58();
process.env.SKR_MINT = Keypair.generate().publicKey.toBase58();
process.env.SERVER_AUTHORITY_SECRET = bs58.encode(serverAuthority.secretKey);

const { chainConfig, validateChainConfig } = await import('../src/chain/config.js');
const { configPda, playerPda, seekerLinkPda, weekPda, ata } = await import('../src/chain/pdas.js');
const { program } = await import('../src/chain/program.js');
const {
  buildCreatePlayerTx, buildBuyTicketTx, buildSubmitDailyBestTx, buildCreateWeekPoolTx, buildSettleWeekTx,
  buildPurchaseTx, buildReviveTx, buildLinkSeekerTx,
} = await import('../src/chain/txs.js');
const {
  getConfig, getPlayer, getWeekPool, getVaultBalance, getTokenBalance, getCatalog, getConfirmedInstructions,
  getSeekerLink,
} = await import('../src/chain/readers.js');
const { catalogPda } = await import('../src/chain/pdas.js');
const { hasPurchase, hasRevive, linkedSeekerMint } = await import('../src/chain/verify.js');

const { programId } = chainConfig();

function discriminatorOf(ixName) {
  return createHash('sha256').update(`global:${ixName}`).digest().subarray(0, 8);
}

/** Decodes the base64 envelope a builder returns back into a VersionedTransaction for inspection. */
function decode(base64) {
  return VersionedTransaction.deserialize(Buffer.from(base64, 'base64'));
}

function onlyInstruction(tx) {
  expect(tx.message.compiledInstructions).toHaveLength(1);
  return tx.message.compiledInstructions[0];
}

describe('chainConfig / validateChainConfig', () => {
  it('builds the config from the environment', () => {
    const cfg = chainConfig();
    expect(cfg.cluster).toBe('devnet');
    expect(cfg.programId.toBase58()).toBe(process.env.PROGRAM_ID);
    expect(cfg.skrMint.toBase58()).toBe(process.env.SKR_MINT);
    expect(cfg.serverAuthority.publicKey.toBase58()).toBe(serverAuthority.publicKey.toBase58());
  });

  it('does not throw for a valid configuration', () => {
    expect(() => validateChainConfig()).not.toThrow();
  });

  it('throws for a 63-byte secret', () => {
    const original = process.env.SERVER_AUTHORITY_SECRET;
    process.env.SERVER_AUTHORITY_SECRET = bs58.encode(serverAuthority.secretKey.slice(0, 63));
    expect(() => validateChainConfig()).toThrow(/64-byte/);
    process.env.SERVER_AUTHORITY_SECRET = original;
  });

  it('throws when a public key is missing', () => {
    const original = process.env.PROGRAM_ID;
    delete process.env.PROGRAM_ID;
    expect(() => chainConfig()).toThrow(/PROGRAM_ID/);
    process.env.PROGRAM_ID = original;
  });
});

describe('PDA helpers', () => {
  it('configPda matches PublicKey.findProgramAddressSync', () => {
    const [expected] = PublicKey.findProgramAddressSync([Buffer.from('config')], programId);
    expect(configPda().toBase58()).toBe(expected.toBase58());
  });

  it('playerPda matches PublicKey.findProgramAddressSync', () => {
    const wallet = Keypair.generate().publicKey;
    const [expected] = PublicKey.findProgramAddressSync([Buffer.from('player'), wallet.toBytes()], programId);
    expect(playerPda(wallet).toBase58()).toBe(expected.toBase58());
  });

  it('weekPda matches PublicKey.findProgramAddressSync with a little-endian u32 seed', () => {
    const week = 137;
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(week, 0);
    const [expected] = PublicKey.findProgramAddressSync([Buffer.from('week'), buf], programId);
    expect(weekPda(week).toBase58()).toBe(expected.toBase58());
  });

  it('seekerLinkPda matches PublicKey.findProgramAddressSync', () => {
    const sgtMint = Keypair.generate().publicKey;
    const [expected] = PublicKey.findProgramAddressSync([Buffer.from('seeker'), sgtMint.toBytes()], programId);
    expect(seekerLinkPda(sgtMint).toBase58()).toBe(expected.toBase58());
  });

  it('ata matches the standard associated-token-address derivation, off-curve owners included', () => {
    const owner = weekPda(1); // a PDA - off-curve
    const mint = chainConfig().skrMint;
    const derived = ata(owner, mint);
    const [expected] = PublicKey.findProgramAddressSync(
      [owner.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mint.toBytes()],
      new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
    );
    expect(derived.toBase58()).toBe(expected.toBase58());
  });
});

describe('buildBuyTicketTx', () => {
  it('produces an unsigned v0 tx, fee payer = wallet, targeting PROGRAM_ID with the buy_ticket discriminator', async () => {
    const connection = new FakeConnection();
    const wallet = Keypair.generate().publicKey;
    const treasury = Keypair.generate().publicKey; // passed in directly, skipping the getConfig round trip
    const week = 42;
    const result = await buildBuyTicketTx(wallet, { week, treasury, connection });

    expect(result.blockhash).toBe(connection.blockhash);
    expect(result.lastValidBlockHeight).toBe(connection.lastValidBlockHeight);
    expect(result.minContextSlot).toBe(1234);

    const tx = decode(result.transaction);
    expect(tx.message.staticAccountKeys[0].toBase58()).toBe(wallet.toBase58()); // fee payer

    const ix = onlyInstruction(tx);
    expect(tx.message.staticAccountKeys[ix.programIdIndex].toBase58()).toBe(programId.toBase58());
    expect(Buffer.from(ix.data.subarray(0, 8))).toEqual(discriminatorOf('buy_ticket'));

    // No signatures yet - every slot is still the zero-filled default.
    for (const sig of tx.signatures) {
      expect(sig.every((byte) => byte === 0)).toBe(true);
    }
  });
});

describe('buildSubmitDailyBestTx', () => {
  it('server partial-signs; the wallet slot stays zeroed', async () => {
    const connection = new FakeConnection();
    const wallet = Keypair.generate().publicKey;
    const day = 20_000;
    const replayHash = new Uint8Array(32).fill(7);
    const result = await buildSubmitDailyBestTx(wallet, { day, score: 1234, replayHash, connection });

    const tx = decode(result.transaction);
    expect(tx.message.staticAccountKeys[0].toBase58()).toBe(wallet.toBase58()); // fee payer

    const ix = onlyInstruction(tx);
    expect(tx.message.staticAccountKeys[ix.programIdIndex].toBase58()).toBe(programId.toBase58());
    expect(Buffer.from(ix.data.subarray(0, 8))).toEqual(discriminatorOf('submit_daily_best'));

    const walletIndex = tx.message.staticAccountKeys.findIndex((k) => k.equals(wallet));
    const serverIndex = tx.message.staticAccountKeys.findIndex((k) => k.equals(serverAuthority.publicKey));
    expect(walletIndex).toBeGreaterThanOrEqual(0);
    expect(serverIndex).toBeGreaterThanOrEqual(0);

    expect(tx.signatures[walletIndex].every((byte) => byte === 0)).toBe(true);
    const verified = nacl.sign.detached.verify(
      tx.message.serialize(),
      tx.signatures[serverIndex],
      serverAuthority.publicKey.toBytes(),
    );
    expect(verified).toBe(true);
  });
});

describe('buildLinkSeekerTx', () => {
  it('server partial-signs the link; the wallet slot stays zeroed and pays the rent', async () => {
    const connection = new FakeConnection();
    const wallet = Keypair.generate().publicKey;
    const sgtMint = Keypair.generate().publicKey;
    const result = await buildLinkSeekerTx(wallet, { sgtMint, connection });

    const tx = decode(result.transaction);
    expect(tx.message.staticAccountKeys[0].toBase58()).toBe(wallet.toBase58()); // fee payer

    const ix = onlyInstruction(tx);
    expect(tx.message.staticAccountKeys[ix.programIdIndex].toBase58()).toBe(programId.toBase58());
    expect(Buffer.from(ix.data.subarray(0, 8))).toEqual(discriminatorOf('link_seeker'));
    // The one argument, right behind the discriminator: sgt_mint (pubkey, 32 bytes).
    expect(new PublicKey(ix.data.subarray(8, 40)).toBase58()).toBe(sgtMint.toBase58());

    const keys = ix.accountKeyIndexes.map((i) => tx.message.staticAccountKeys[i].toBase58());
    expect(keys).toEqual([
      wallet.toBase58(),
      serverAuthority.publicKey.toBase58(),
      configPda().toBase58(),
      playerPda(wallet).toBase58(),
      seekerLinkPda(sgtMint).toBase58(),
      SystemProgram.programId.toBase58(),
    ]);

    const walletIndex = tx.message.staticAccountKeys.findIndex((k) => k.equals(wallet));
    const serverIndex = tx.message.staticAccountKeys.findIndex((k) => k.equals(serverAuthority.publicKey));
    expect(tx.signatures[walletIndex].every((byte) => byte === 0)).toBe(true);
    expect(nacl.sign.detached.verify(
      tx.message.serialize(), tx.signatures[serverIndex], serverAuthority.publicKey.toBytes(),
    )).toBe(true);
  });

  it('creates the player first for a wallet that has none, in the same transaction', async () => {
    const connection = new FakeConnection();
    const wallet = Keypair.generate().publicKey;
    const sgtMint = Keypair.generate().publicKey;
    const result = await buildLinkSeekerTx(wallet, { sgtMint, createPlayer: true, connection });

    const tx = decode(result.transaction);
    expect(tx.message.compiledInstructions).toHaveLength(2);
    const [createIx, linkIx] = tx.message.compiledInstructions;
    expect(Buffer.from(createIx.data.subarray(0, 8))).toEqual(discriminatorOf('create_player'));
    expect(Buffer.from(linkIx.data.subarray(0, 8))).toEqual(discriminatorOf('link_seeker'));
  });
});

describe('buildCreatePlayerTx', () => {
  it('unsigned, fee payer = wallet, create_player discriminator', async () => {
    const connection = new FakeConnection();
    const wallet = Keypair.generate().publicKey;
    const result = await buildCreatePlayerTx(wallet, { connection });
    const tx = decode(result.transaction);
    expect(tx.message.staticAccountKeys[0].toBase58()).toBe(wallet.toBase58());
    const ix = onlyInstruction(tx);
    expect(Buffer.from(ix.data.subarray(0, 8))).toEqual(discriminatorOf('create_player'));
    for (const sig of tx.signatures) expect(sig.every((byte) => byte === 0)).toBe(true);
  });
});

describe('buildCreateWeekPoolTx', () => {
  it('fee payer = server authority, fully signed, create_week_pool discriminator', async () => {
    const connection = new FakeConnection();
    const result = await buildCreateWeekPoolTx(99, { connection });
    const tx = decode(result.transaction);
    expect(tx.message.staticAccountKeys[0].toBase58()).toBe(serverAuthority.publicKey.toBase58());
    const ix = onlyInstruction(tx);
    expect(Buffer.from(ix.data.subarray(0, 8))).toEqual(discriminatorOf('create_week_pool'));
    const verified = nacl.sign.detached.verify(tx.message.serialize(), tx.signatures[0], serverAuthority.publicKey.toBytes());
    expect(verified).toBe(true);
  });
});

describe('buildSettleWeekTx', () => {
  it('fee payer = server authority, fully signed, remaining accounts are (wallet, ata) pairs per winner', async () => {
    const connection = new FakeConnection();
    const winners = [Keypair.generate().publicKey, Keypair.generate().publicKey];
    const result = await buildSettleWeekTx(7, winners, { connection });
    const tx = decode(result.transaction);
    expect(tx.message.staticAccountKeys[0].toBase58()).toBe(serverAuthority.publicKey.toBase58());
    // F4: the first instruction must be the compute-budget one - up to 10 ATA creations + 10
    // transfer_checked CPIs + 1 rollover transfer can exceed the default 200_000 CU budget.
    expect(tx.message.compiledInstructions).toHaveLength(2);
    const [budgetIx, ix] = tx.message.compiledInstructions;
    expect(tx.message.staticAccountKeys[budgetIx.programIdIndex].toBase58()).toBe(ComputeBudgetProgram.programId.toBase58());
    expect(Buffer.from(ix.data.subarray(0, 8))).toEqual(discriminatorOf('settle_week'));
    // 2 winners * (wallet + ata) = 4 remaining accounts, appended after the instruction's own fixed accounts.
    expect(ix.accountKeyIndexes.length).toBeGreaterThanOrEqual(4);
    const lastFour = ix.accountKeyIndexes.slice(-4);
    const lastFourKeys = lastFour.map((i) => tx.message.staticAccountKeys[i].toBase58());
    expect(lastFourKeys[0]).toBe(winners[0].toBase58());
    expect(lastFourKeys[2]).toBe(winners[1].toBase58());
    // Task 7 deferred minor: each winner's ATA (index 1 and 3 of the pairs) must be writable so
    // the payout/creation CPI can touch it; each wallet (index 0 and 2) must not be, since
    // settle_week is permissionless - only `caller` (the server authority) signs.
    expect(tx.message.isAccountWritable(lastFour[0])).toBe(false); // wallet
    expect(tx.message.isAccountWritable(lastFour[1])).toBe(true); // ata
    expect(tx.message.isAccountWritable(lastFour[2])).toBe(false); // wallet
    expect(tx.message.isAccountWritable(lastFour[3])).toBe(true); // ata
    const verified = nacl.sign.detached.verify(tx.message.serialize(), tx.signatures[0], serverAuthority.publicKey.toBytes());
    expect(verified).toBe(true);
  });
});

describe('readers', () => {
  let connection;
  beforeEach(() => {
    connection = new FakeConnection();
  });

  it('getConfig/getPlayer/getWeekPool return null when the account does not exist', async () => {
    expect(await getConfig(connection)).toBeNull();
    expect(await getPlayer(Keypair.generate().publicKey, connection)).toBeNull();
    expect(await getWeekPool(1, connection)).toBeNull();
  });

  it('getWeekPool decodes and trims `top` to `top_len`', async () => {
    const week = 5;
    const prog = program(connection);
    const emptyEntry = { player: PublicKey.default, total: new BN(0), updatedAt: new BN(0) };
    const winner = Keypair.generate().publicKey;
    const top = [
      { player: winner, total: new BN(4321), updatedAt: new BN(1_700_000_000) },
      ...Array.from({ length: 9 }, () => emptyEntry),
    ];
    const data = await prog.coder.accounts.encode('weekPool', {
      week,
      vault: ata(weekPda(week), chainConfig().skrMint),
      top,
      topLen: 1,
      settled: false,
      bump: 255,
    });
    connection.setAccount(weekPda(week), { data, owner: programId });

    const pool = await getWeekPool(week, connection);
    expect(pool.week).toBe(week);
    expect(pool.settled).toBe(false);
    expect(pool.top).toHaveLength(1);
    expect(pool.top[0]).toEqual({ player: winner.toBase58(), total: 4321, updatedAt: 1_700_000_000 });
  });

  it('getVaultBalance/getTokenBalance return 0n for a missing token account and the real amount otherwise', async () => {
    const owner = Keypair.generate().publicKey;
    expect(await getTokenBalance(owner, connection)).toBe(0n);
    expect(await getVaultBalance(3, connection)).toBe(0n);

    const { skrMint } = chainConfig();
    const data = Buffer.alloc(ACCOUNT_SIZE);
    AccountLayout.encode({
      mint: skrMint,
      owner,
      amount: 9_500_000n,
      delegateOption: 0,
      delegate: PublicKey.default,
      state: AccountState.Initialized,
      isNativeOption: 0,
      isNative: 0n,
      delegatedAmount: 0n,
      closeAuthorityOption: 0,
      closeAuthority: PublicKey.default,
    }, data);
    connection.setAccount(ata(owner, skrMint), { data, owner: TOKEN_PROGRAM_ID });

    expect(await getTokenBalance(owner, connection)).toBe(9_500_000n);
  });

  it('getSeekerLink returns null for an unlinked mint and decodes the link otherwise', async () => {
    const sgtMint = Keypair.generate().publicKey;
    expect(await getSeekerLink(sgtMint, connection)).toBeNull();

    const player = Keypair.generate().publicKey;
    const data = await program(connection).coder.accounts.encode('seekerLink', {
      sgtMint,
      player,
      linkedAt: new BN(1_700_000_123),
      bump: 254,
    });
    connection.setAccount(seekerLinkPda(sgtMint), { data, owner: programId });

    expect(await getSeekerLink(sgtMint, connection)).toEqual({
      sgtMint: sgtMint.toBase58(), player: player.toBase58(), linkedAt: 1_700_000_123, bump: 254,
    });
  });

  it('getCatalog returns null when the account does not exist, and trims items to `count` otherwise', async () => {
    expect(await getCatalog(connection)).toBeNull();

    const prog = program(connection);
    const emptyItem = { id: 0, kind: 0, price: new BN(0), active: false };
    const items = [
      { id: 5, kind: 1, price: new BN(25_000_000), active: true },
      ...Array.from({ length: 63 }, () => emptyItem),
    ];
    const data = await prog.coder.accounts.encode('catalog', {
      admin: Keypair.generate().publicKey,
      items,
      count: 1,
      bump: 255,
    });
    connection.setAccount(catalogPda(), { data, owner: programId });

    const catalog = await getCatalog(connection);
    expect(catalog.count).toBe(1);
    expect(catalog.items).toEqual([{ id: 5, kind: 1, price: 25_000_000n, active: true }]);
  });
});

describe('buildPurchaseTx', () => {
  it('produces an unsigned v0 tx targeting PROGRAM_ID with the purchase discriminator, args and accounts', async () => {
    const connection = new FakeConnection();
    const wallet = Keypair.generate().publicKey;
    const treasury = Keypair.generate().publicKey;
    const week = 42;
    const result = await buildPurchaseTx(wallet, { itemId: 3, maxPrice: 25_000_000n, week, treasury, connection });

    const tx = decode(result.transaction);
    expect(tx.message.staticAccountKeys[0].toBase58()).toBe(wallet.toBase58());
    const ix = onlyInstruction(tx);
    expect(tx.message.staticAccountKeys[ix.programIdIndex].toBase58()).toBe(programId.toBase58());
    const data = Buffer.from(ix.data);
    expect(data.subarray(0, 8)).toEqual(discriminatorOf('purchase'));
    expect(data.readUInt8(8)).toBe(3);
    expect(data.readBigUInt64LE(9)).toBe(25_000_000n);
    for (const sig of tx.signatures) expect(sig.every((byte) => byte === 0)).toBe(true);

    const { skrMint } = chainConfig();
    const weekPoolKey = weekPda(week);
    const keys = tx.message.staticAccountKeys.map((k) => k.toBase58());
    expect(keys).toEqual(expect.arrayContaining([
      wallet.toBase58(),
      playerPda(wallet).toBase58(),
      catalogPda().toBase58(),
      weekPoolKey.toBase58(),
      ata(weekPoolKey, skrMint).toBase58(),
      treasury.toBase58(),
      ata(wallet, skrMint).toBase58(),
    ]));
  });

  it('composes create_player before purchase when createPlayer is true, for a wallet with no Player PDA yet', async () => {
    const connection = new FakeConnection();
    const wallet = Keypair.generate().publicKey;
    const treasury = Keypair.generate().publicKey;
    const result = await buildPurchaseTx(wallet, { itemId: 3, maxPrice: 25_000_000n, week: 42, treasury, createPlayer: true, connection });

    const tx = decode(result.transaction);
    expect(tx.message.compiledInstructions).toHaveLength(2);
    const [createIx, purchaseIx] = tx.message.compiledInstructions;
    expect(Buffer.from(createIx.data.subarray(0, 8))).toEqual(discriminatorOf('create_player'));
    expect(Buffer.from(purchaseIx.data.subarray(0, 8))).toEqual(discriminatorOf('purchase'));
  });

  it('omits create_player when createPlayer is false/omitted', async () => {
    const connection = new FakeConnection();
    const wallet = Keypair.generate().publicKey;
    const treasury = Keypair.generate().publicKey;
    const result = await buildPurchaseTx(wallet, { itemId: 3, maxPrice: 25_000_000n, week: 42, treasury, connection });
    expect(decode(result.transaction).message.compiledInstructions).toHaveLength(1);
  });
});

describe('buildReviveTx', () => {
  it('produces an unsigned v0 tx targeting PROGRAM_ID with the revive discriminator', async () => {
    const connection = new FakeConnection();
    const wallet = Keypair.generate().publicKey;
    const treasury = Keypair.generate().publicKey;
    const result = await buildReviveTx(wallet, { week: 42, treasury, maxPrice: 25_000_000n, connection });

    const tx = decode(result.transaction);
    expect(tx.message.staticAccountKeys[0].toBase58()).toBe(wallet.toBase58());
    const ix = onlyInstruction(tx);
    expect(tx.message.staticAccountKeys[ix.programIdIndex].toBase58()).toBe(programId.toBase58());
    expect(Buffer.from(ix.data.subarray(0, 8))).toEqual(discriminatorOf('revive'));
    // `max_price` follows the discriminator as a little-endian u64: the quoted price the chain may not exceed.
    expect(Buffer.from(ix.data.subarray(8, 16)).readBigUInt64LE()).toBe(25_000_000n);
    expect(ix.data).toHaveLength(16);
    for (const sig of tx.signatures) expect(sig.every((byte) => byte === 0)).toBe(true);
  });

  it('refuses to build a revive without maxPrice', async () => {
    const connection = new FakeConnection();
    const wallet = Keypair.generate().publicKey;
    await expect(buildReviveTx(wallet, { week: 42, treasury: Keypair.generate().publicKey, connection })).rejects.toThrow(/maxPrice/);
  });

  it('composes create_player before revive when createPlayer is true, for a wallet with no Player PDA yet', async () => {
    const connection = new FakeConnection();
    const wallet = Keypair.generate().publicKey;
    const treasury = Keypair.generate().publicKey;
    const result = await buildReviveTx(wallet, { week: 42, treasury, maxPrice: 25_000_000n, createPlayer: true, connection });

    const tx = decode(result.transaction);
    expect(tx.message.compiledInstructions).toHaveLength(2);
    const [createIx, reviveIx] = tx.message.compiledInstructions;
    expect(Buffer.from(createIx.data.subarray(0, 8))).toEqual(discriminatorOf('create_player'));
    expect(Buffer.from(reviveIx.data.subarray(0, 8))).toEqual(discriminatorOf('revive'));
  });

  it('omits create_player when createPlayer is false/omitted', async () => {
    const connection = new FakeConnection();
    const wallet = Keypair.generate().publicKey;
    const treasury = Keypair.generate().publicKey;
    const result = await buildReviveTx(wallet, { week: 42, treasury, maxPrice: 25_000_000n, connection });
    expect(decode(result.transaction).message.compiledInstructions).toHaveLength(1);
  });
});

describe('getConfirmedInstructions', () => {
  it('returns missing/failed/confirmed exactly like getTransactionStatus, plus flattened instructions', async () => {
    const connection = new FakeConnection();
    const calls = [];
    connection.getTransaction = async (signature) => {
      calls.push(signature);
      if (signature === 'missing-sig') return null;
      if (signature === 'failed-sig') return { meta: { err: { InstructionError: [0, 'Custom'] } }, transaction: { message: { staticAccountKeys: [], compiledInstructions: [] } } };
      const wallet = Keypair.generate().publicKey;
      const treasury = Keypair.generate().publicKey;
      const { transaction } = await buildPurchaseTx(wallet, { itemId: 3, maxPrice: 25_000_000n, week: 1, treasury, connection: new FakeConnection() });
      const tx = decode(transaction);
      return { meta: { err: null }, transaction: { message: tx.message } };
    };

    expect(await getConfirmedInstructions('missing-sig', connection)).toEqual({ status: 'missing' });
    expect(await getConfirmedInstructions('failed-sig', connection)).toEqual({ status: 'failed' });

    const result = await getConfirmedInstructions('good-sig', connection);
    expect(result.status).toBe('confirmed');
    expect(result.instructions).toHaveLength(1);
    expect(result.instructions[0].programId).toBe(programId.toBase58());
    expect(Buffer.from(result.instructions[0].data.subarray(0, 8))).toEqual(discriminatorOf('purchase'));
    expect(calls).toEqual(['missing-sig', 'failed-sig', 'good-sig']);
  });
});

describe('chain/verify', () => {
  async function purchaseInstructions(wallet, { itemId = 3, maxPrice = 25_000_000n } = {}) {
    const treasury = Keypair.generate().publicKey;
    const { transaction } = await buildPurchaseTx(wallet, { itemId, maxPrice, week: 1, treasury, connection: new FakeConnection() });
    return (await getConfirmedInstructions('sig', {
      getTransaction: async () => ({ meta: { err: null }, transaction: { message: decode(transaction).message } }),
    })).instructions;
  }

  async function reviveInstructions(wallet) {
    const treasury = Keypair.generate().publicKey;
    const { transaction } = await buildReviveTx(wallet, { maxPrice: 25_000_000n, week: 1, treasury, connection: new FakeConnection() });
    return (await getConfirmedInstructions('sig', {
      getTransaction: async () => ({ meta: { err: null }, transaction: { message: decode(transaction).message } }),
    })).instructions;
  }

  it('hasPurchase is true for a matching wallet+item, false for a wrong wallet or a wrong item', async () => {
    const wallet = Keypair.generate().publicKey.toBase58();
    const other = Keypair.generate().publicKey.toBase58();
    const instructions = await purchaseInstructions(new PublicKey(wallet), { itemId: 3 });

    expect(hasPurchase(instructions, { wallet, itemId: 3 })).toBe(true);
    expect(hasPurchase(instructions, { wallet: other, itemId: 3 })).toBe(false);
    expect(hasPurchase(instructions, { wallet, itemId: 4 })).toBe(false);
  });

  it('hasPurchase is false for a foreign-program instruction', async () => {
    const wallet = Keypair.generate().publicKey;
    const transferIx = SystemProgram.transfer({ fromPubkey: wallet, toPubkey: wallet, lamports: 1 });
    const message = new TransactionMessage({
      payerKey: wallet, recentBlockhash: '9BFbBLgQ5FLdTsg3D96oXTQmuGaEjkCJVAeDN9nWzPqi', instructions: [transferIx],
    }).compileToV0Message();
    const instructions = (await getConfirmedInstructions('sig', {
      getTransaction: async () => ({ meta: { err: null }, transaction: { message } }),
    })).instructions;
    expect(hasPurchase(instructions, { wallet: wallet.toBase58(), itemId: 3 })).toBe(false);
  });

  it('hasPurchase is false for a wrong-instruction transaction (revive instead of purchase)', async () => {
    const wallet = Keypair.generate().publicKey;
    const instructions = await reviveInstructions(wallet);
    expect(hasPurchase(instructions, { wallet: wallet.toBase58(), itemId: 3 })).toBe(false);
  });

  it('hasRevive is true for a matching wallet, false for a wrong wallet or a wrong instruction', async () => {
    const wallet = Keypair.generate().publicKey;
    const other = Keypair.generate().publicKey.toBase58();
    const instructions = await reviveInstructions(wallet);

    expect(hasRevive(instructions, { wallet: wallet.toBase58() })).toBe(true);
    expect(hasRevive(instructions, { wallet: other })).toBe(false);

    const purchaseIx = await purchaseInstructions(wallet);
    expect(hasRevive(purchaseIx, { wallet: wallet.toBase58() })).toBe(false);
  });

  it('hasPurchase is false for our purchase discriminator, the right wallet and item, under a foreign program id', async () => {
    // Everything but the program id is exactly what a real purchase looks like - this is the test
    // that would go green (wrongly) if the `ix.programId === programIdStr` check were ever removed
    // from `chain/verify.js`'s `matchingInstructions`.
    const wallet = Keypair.generate().publicKey;
    const real = await purchaseInstructions(wallet, { itemId: 3 });
    const spoofed = real.map((ix) => ({ ...ix, programId: Keypair.generate().publicKey.toBase58() }));
    expect(hasPurchase(spoofed, { wallet: wallet.toBase58(), itemId: 3 })).toBe(false);
  });

  it('hasPurchase checks every matching instruction, not just the first: a tx with two purchases confirms either item', async () => {
    const wallet = Keypair.generate().publicKey;
    const treasury = Keypair.generate().publicKey;
    const { skrMint } = chainConfig();
    const weekPoolKey = weekPda(1);
    const connection = new FakeConnection();
    async function purchaseIx(itemId) {
      return program(connection)
        .methods.purchase(itemId, new BN(1_000_000))
        .accountsPartial({
          wallet, config: configPda(), player: playerPda(wallet), catalog: catalogPda(),
          weekPool: weekPoolKey, vault: ata(weekPoolKey, skrMint), treasury,
          walletToken: ata(wallet, skrMint), skrMint, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();
    }
    const message = new TransactionMessage({
      payerKey: wallet,
      recentBlockhash: '9BFbBLgQ5FLdTsg3D96oXTQmuGaEjkCJVAeDN9nWzPqi',
      instructions: [await purchaseIx(3), await purchaseIx(4)],
    }).compileToV0Message();
    const instructions = (await getConfirmedInstructions('sig', {
      getTransaction: async () => ({ meta: { err: null }, transaction: { message } }),
    })).instructions;

    expect(hasPurchase(instructions, { wallet: wallet.toBase58(), itemId: 3 })).toBe(true);
    expect(hasPurchase(instructions, { wallet: wallet.toBase58(), itemId: 4 })).toBe(true);
    expect(hasPurchase(instructions, { wallet: wallet.toBase58(), itemId: 5 })).toBe(false);
  });

  async function linkSeekerInstructions(wallet, { sgtMint, server = serverAuthority.publicKey } = {}) {
    const connection = new FakeConnection();
    const mint = sgtMint ?? Keypair.generate().publicKey;
    const ix = await program(connection)
      .methods.linkSeeker(mint)
      .accountsPartial({
        wallet,
        serverAuthority: server,
        config: configPda(),
        player: playerPda(wallet),
        seekerLink: seekerLinkPda(mint),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    const message = new TransactionMessage({
      payerKey: wallet, recentBlockhash: '9BFbBLgQ5FLdTsg3D96oXTQmuGaEjkCJVAeDN9nWzPqi', instructions: [ix],
    }).compileToV0Message();
    return (await getConfirmedInstructions('sig', {
      getTransaction: async () => ({ meta: { err: null }, transaction: { message } }),
    })).instructions;
  }

  it('linkedSeekerMint needs both signers: the wallet and our own server authority', async () => {
    const wallet = Keypair.generate().publicKey;
    const sgtMint = Keypair.generate().publicKey;
    const other = Keypair.generate().publicKey.toBase58();
    const server = serverAuthority.publicKey.toBase58();
    const instructions = await linkSeekerInstructions(wallet, { sgtMint });

    expect(linkedSeekerMint(instructions, { wallet: wallet.toBase58(), serverAuthority: server })).toBe(sgtMint.toBase58());
    expect(linkedSeekerMint(instructions, { wallet: other, serverAuthority: server })).toBeNull();
    expect(linkedSeekerMint(instructions, { wallet: wallet.toBase58(), serverAuthority: other })).toBeNull();
  });

  it('linkedSeekerMint is null for a link co-signed by a foreign server authority', async () => {
    // The server's signature is the attestation that the mainnet Seeker check passed, so a link
    // attested by anybody else must not confirm - however well-formed the rest of it looks.
    const wallet = Keypair.generate().publicKey;
    const instructions = await linkSeekerInstructions(wallet, { server: Keypair.generate().publicKey });
    expect(linkedSeekerMint(instructions, { wallet: wallet.toBase58(), serverAuthority: serverAuthority.publicKey.toBase58() })).toBeNull();
  });

  it('linkedSeekerMint is null for a foreign program id and for another instruction of ours', async () => {
    const wallet = Keypair.generate().publicKey;
    const server = serverAuthority.publicKey.toBase58();
    const real = await linkSeekerInstructions(wallet);
    const spoofed = real.map((ix) => ({ ...ix, programId: Keypair.generate().publicKey.toBase58() }));
    expect(linkedSeekerMint(spoofed, { wallet: wallet.toBase58(), serverAuthority: server })).toBeNull();
    expect(linkedSeekerMint(await purchaseInstructions(wallet), { wallet: wallet.toBase58(), serverAuthority: server })).toBeNull();
  });

  it('linkedSeekerMint reads the linked mint off the verified instruction itself', async () => {
    const wallet = Keypair.generate().publicKey;
    const sgtMint = Keypair.generate().publicKey;
    const server = serverAuthority.publicKey.toBase58();
    const instructions = await linkSeekerInstructions(wallet, { sgtMint });

    expect(linkedSeekerMint(instructions, { wallet: wallet.toBase58(), serverAuthority: server })).toBe(sgtMint.toBase58());
    expect(linkedSeekerMint(instructions, { wallet: Keypair.generate().publicKey.toBase58(), serverAuthority: server })).toBeNull();
  });
});
