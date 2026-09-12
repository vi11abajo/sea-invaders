import { createHash } from 'node:crypto';
import { Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
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
const { configPda, playerPda, weekPda, ata } = await import('../src/chain/pdas.js');
const { program } = await import('../src/chain/program.js');
const {
  buildCreatePlayerTx, buildBuyTicketTx, buildSubmitDailyBestTx, buildCreateWeekPoolTx, buildSettleWeekTx,
} = await import('../src/chain/txs.js');
const {
  getConfig, getPlayer, getWeekPool, getVaultBalance, getTokenBalance,
} = await import('../src/chain/readers.js');

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
    const ix = onlyInstruction(tx);
    expect(Buffer.from(ix.data.subarray(0, 8))).toEqual(discriminatorOf('settle_week'));
    // 2 winners * (wallet + ata) = 4 remaining accounts, appended after the instruction's own fixed accounts.
    expect(ix.accountKeyIndexes.length).toBeGreaterThanOrEqual(4);
    const lastFour = ix.accountKeyIndexes.slice(-4).map((i) => tx.message.staticAccountKeys[i].toBase58());
    expect(lastFour[0]).toBe(winners[0].toBase58());
    expect(lastFour[2]).toBe(winners[1].toBase58());
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
});
