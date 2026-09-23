// A cache of a wallet's on-chain shop state (`inventory`, `tide`, `tide_at`) plus the truly
// off-chain loadout selection (`active_skin`, `active_variant` - there is no on-chain instruction
// for equipping a skin/variant, see design doc §3/§5). Refreshed by `GET /api/shop` and the
// `confirm*` endpoints once they know the fresh on-chain state.
import pool from '../config/database.js';

/**
 * `inventory` is an unsigned 64-bit bitmask (catalog ids go up to 63, `shop.rs`'s `build_items`),
 * but the `inventory` column is a signed Postgres `BIGINT` - `asIntN`/`asUintN` round-trip it
 * through the same 64-bit two's-complement bit pattern so a wallet owning item 63 does not
 * overflow the column.
 */
function toColumn(inventory) {
  return BigInt.asIntN(64, inventory).toString();
}
function fromColumn(value) {
  return BigInt.asUintN(64, BigInt(value));
}

function fromRow(row) {
  if (!row) return null;
  return {
    walletAddress: row.wallet_address,
    inventory: fromColumn(row.inventory),
    tide: row.tide,
    tideAt: row.tide_at === null ? null : Number(row.tide_at),
    activeSkin: row.active_skin,
    activeVariant: row.active_variant,
    updatedAt: row.updated_at,
  };
}

/** The stored loadout row for `wallet`, or `null` if it has never been written. */
export async function getLoadout(wallet) {
  const result = await pool.query('SELECT * FROM player_loadout WHERE wallet_address = $1', [wallet]);
  return fromRow(result.rows[0]);
}

/**
 * Upserts `wallet`'s loadout row. Only the columns present in `patch` are changed - an omitted
 * column keeps its stored value (or, for a wallet's first row, the all-zero default): each
 * `COALESCE($n, player_loadout.<column>)` falls back to the existing row whenever the matching
 * param is `null`, entirely inside the one statement. This only protects a column callers actually
 * omit from `patch` - `routes/profile.js`'s PUT omits `inventory` for exactly this reason, so a
 * concurrent `confirm*` refresh's fresher inventory is never rolled back by a stale read.
 */
export async function upsertLoadout(wallet, patch) {
  const params = [
    wallet,
    patch.inventory !== undefined ? toColumn(patch.inventory) : null,
    patch.tide !== undefined ? patch.tide : null,
    patch.tideAt !== undefined ? patch.tideAt : null,
    patch.activeSkin !== undefined ? patch.activeSkin : null,
    patch.activeVariant !== undefined ? patch.activeVariant : null,
  ];
  const result = await pool.query(
    `INSERT INTO player_loadout (wallet_address, inventory, tide, tide_at, active_skin, active_variant, updated_at)
     VALUES ($1, COALESCE($2, 0), $3, $4, COALESCE($5, 0), COALESCE($6, 0), NOW())
     ON CONFLICT (wallet_address) DO UPDATE SET
       inventory = COALESCE($2, player_loadout.inventory),
       tide = COALESCE($3, player_loadout.tide),
       tide_at = COALESCE($4, player_loadout.tide_at),
       active_skin = COALESCE($5, player_loadout.active_skin),
       active_variant = COALESCE($6, player_loadout.active_variant),
       updated_at = NOW()
     RETURNING *`,
    params,
  );
  return fromRow(result.rows[0]);
}
