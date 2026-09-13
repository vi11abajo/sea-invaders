// Exercises the real `db/loadout.js` against a mocked `pg` pool (not `memoryLoadout.js`, which is a
// pure-JS stand-in that never has to worry about Postgres's signed BIGINT range) - specifically the
// bit-63 inventory round trip and the partial-column upsert, which only this module's own SQL can
// prove.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queries = [];
const rowsByWallet = new Map();

/** A minimal `pg`-shaped fake: applies the same COALESCE-on-conflict semantics `upsertLoadout`'s SQL expresses, so the column values it returns are exactly what a real Postgres would store. */
function fakeQuery(sql, params) {
  queries.push({ sql, params });
  if (sql.startsWith('SELECT')) {
    const row = rowsByWallet.get(params[0]);
    return { rows: row ? [row] : [] };
  }
  // INSERT ... ON CONFLICT DO UPDATE, params = [wallet, inventory, tide, tide_at, active_skin, active_variant]
  const [wallet, inventory, tide, tideAt, activeSkin, activeVariant] = params;
  const existing = rowsByWallet.get(wallet);
  const row = {
    wallet_address: wallet,
    inventory: inventory ?? existing?.inventory ?? '0',
    tide: tide ?? existing?.tide ?? null,
    tide_at: tideAt ?? existing?.tide_at ?? null,
    active_skin: activeSkin ?? existing?.active_skin ?? 0,
    active_variant: activeVariant ?? existing?.active_variant ?? 0,
    updated_at: new Date(),
  };
  rowsByWallet.set(wallet, row);
  return { rows: [row] };
}

vi.mock('../src/config/database.js', () => ({
  default: { query: async (sql, params) => fakeQuery(sql, params) },
}));

const { getLoadout, upsertLoadout } = await import('../src/db/loadout.js');

describe('db/loadout.js - inventory u64 round trip and partial upserts', () => {
  beforeEach(() => {
    queries.length = 0;
    rowsByWallet.clear();
  });

  it('stores an inventory with bit 63 set as a signed BIGINT and reads it back as the original unsigned bigint', async () => {
    const inventoryWithBit63 = (1n << 63n) | 1n; // item 63 and item 0 both owned
    const stored = await upsertLoadout('Wallet1', { inventory: inventoryWithBit63 });

    // The raw value handed to `pool.query` must fit Postgres's signed int8 range (it would not, as
    // the plain unsigned bigint) - i.e. it must be negative, the two's-complement reinterpretation.
    const sentParam = BigInt(queries[0].params[1]);
    expect(sentParam).toBeLessThan(0n);
    expect(stored.inventory).toBe(inventoryWithBit63);

    const reread = await getLoadout('Wallet1');
    expect(reread.inventory).toBe(inventoryWithBit63);
  });

  it('round-trips an ordinary small inventory unchanged', async () => {
    const stored = await upsertLoadout('Wallet2', { inventory: 9n });
    expect(stored.inventory).toBe(9n);
    expect(await getLoadout('Wallet2').then((r) => r.inventory)).toBe(9n);
  });

  it('upserting only activeSkin leaves a previously-stored inventory/tide untouched (no read-then-write race)', async () => {
    await upsertLoadout('Wallet3', { inventory: 5n, tide: 2, tideAt: 100, activeSkin: 1, activeVariant: 1 });
    const updated = await upsertLoadout('Wallet3', { activeSkin: 2 });
    expect(updated).toMatchObject({ inventory: 5n, tide: 2, tideAt: 100, activeSkin: 2, activeVariant: 1 });
  });

  it('a first-time upsert with no inventory given defaults it to 0, satisfying the NOT NULL column', async () => {
    const stored = await upsertLoadout('Wallet4', { activeSkin: 1 });
    expect(stored.inventory).toBe(0n);
  });
});
