/**
 * Creates the devnet `Catalog` with the eighteen shop items of the champions and skins design
 * (spec section 4), every one on sale. `PRICES_SKR` below is the one place a shop price is set,
 * in whole SKR: the chain stores it in SKR base units (6 decimals) and the backend and the app
 * read it from there, never from this file - no price exists in `core/`, `backend/` or `mobile/`.
 * To change a price, edit its row and run with `--update`. The first three champions were priced
 * at $1, $2 and $3 in SKR, rounded UP to a whole SKR at the rate of the day the list was set
 * ($0.01808/SKR on 2026-09-15 -> 56, 111, 166 SKR); the three sold since 2026-09-23 follow the
 * same ladder.
 *
 * The catalogue lives at the PDA seeded `[b"catalog", b"v2"]` since 2026-09-23 (64 rows - the
 * whole of `Player.inventory`'s u64 bitmask); the 16-row account at `[b"catalog"]` is abandoned on
 * devnet, so the first run after the program upgrade takes the `initCatalog` branch.
 *
 * Item ids are the inventory bits. Their names live in `core/src/catalogue.ts` (`ITEM_NAMES`),
 * which this script does not import - it runs under `programs/`' own ts-node. For reference:
 *   0 Azul, 1 Krang, 2 Poseidon                  champions (Harpoon, Anchor, Trident)
 *   3 Lime, 4 Lilac, 5 Ember, 6 Abyss            tint skins
 *   7 Bear, 8 Bunny, 9 Sponge, 10 Tiger,         drawn skins
 *   11 Grim, 12 King, 13 Matrix, 14 Sharingan
 *   15 Noob, 16 Coraluna, 17 Shoupe              champions (Thick skin, Surge, Last stand)
 * Hex, Kakashi and the Pengu, Reaper, Wizard, Outlaw and Seeker skins are awarded, not sold, so
 * they have no row here.
 *
 * Idempotent: when the catalog already exists and matches `ITEMS`, it prints the stored items
 * and exits 0. When it exists but differs, it prints both lists and exits 1, unless run with
 * `--update`, which calls `setCatalog` (admin only) so the chain follows `ITEMS` - the way to
 * change prices later.
 *
 * Run from `programs/`:
 *   npx ts-node scripts/init-catalog.ts            (or `npm run devnet:catalog`)
 *   npx ts-node scripts/init-catalog.ts --update
 *
 * Env:
 *   KEYS_DIR             required - your keys directory; reads admin.json from here (secrets
 *                        never printed).
 *   ANCHOR_PROVIDER_URL  default https://api.devnet.solana.com
 */
import { BN } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import { loadKeypair, loadProgram } from "./common";

const SKR = 1_000_000;
const VARIANT = 0;
const SKIN = 1;

interface Item {
  id: number;
  kind: number;
  price: BN;
  active: boolean;
}

/** The one place a shop price is set (whole SKR; the chain stores base units). Edit, then run with --update. */
const PRICES_SKR: Readonly<Record<number, number>> = {
  0: 56, 1: 111, 2: 166,           // champions Azul (Harpoon), Krang (Anchor), Poseidon (Trident) - unchanged
  3: 25, 4: 25, 5: 35, 6: 50,      // tint skins Lime, Lilac, Ember, Abyss - unchanged
  7: 35, 8: 35, 9: 35, 10: 35, 11: 35, 12: 35, // drawn skins Bear, Bunny, Sponge, Tiger, Grim, King
  13: 50, 14: 50,                  // drawn skins Matrix, Sharingan
  15: 56, 16: 111, 17: 166,        // champions Noob (Thick skin), Coraluna (Surge), Shoupe (Last stand)
};

/** Whether each item is a champion (`VARIANT`) or a look (`SKIN`); every id in `PRICES_SKR` needs one. */
const KIND: Readonly<Record<number, number>> = {
  0: VARIANT, 1: VARIANT, 2: VARIANT,
  3: SKIN, 4: SKIN, 5: SKIN, 6: SKIN, 7: SKIN, 8: SKIN, 9: SKIN, 10: SKIN, 11: SKIN, 12: SKIN, 13: SKIN, 14: SKIN,
  15: VARIANT, 16: VARIANT, 17: VARIANT,
};

// Before any transaction: every priced id needs a kind and every kind a price (the `!` on
// `KIND[id]` and `PRICES_SKR[id]` below would otherwise hide a missing row).
const pricedWithoutKind = Object.keys(PRICES_SKR).filter((id) => !(id in KIND));
const kindWithoutPrice = Object.keys(KIND).filter((id) => !(id in PRICES_SKR));
if (pricedWithoutKind.length > 0 || kindWithoutPrice.length > 0) {
  throw new Error(
    `PRICES_SKR and KIND must list the same ids: priced without a kind [${pricedWithoutKind.join(", ")}], ` +
      `a kind without a price [${kindWithoutPrice.join(", ")}]`
  );
}

/** The catalogue sent to the chain: one-time purchases in id order, all on sale. */
const ITEMS: Item[] = Object.keys(PRICES_SKR)
  .map(Number)
  .sort((a, b) => a - b)
  .map((id) => ({ id, kind: KIND[id]!, price: new BN(PRICES_SKR[id]! * SKR), active: true }));
if (ITEMS.length > 64) throw new Error("the on-chain catalogue holds at most 64 rows");

function catalogPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("catalog"), Buffer.from("v2")],
    programId
  )[0];
}

function describe(items: Item[]): string {
  return items
    .map((it) => `  id ${it.id} kind ${it.kind === VARIANT ? "variant" : "skin"} price ${it.price.toNumber() / SKR} SKR ${it.active ? "active" : "inactive"}`)
    .join("\n");
}

function same(a: Item[], b: Item[]): boolean {
  return (
    a.length === b.length &&
    a.every((it, i) => it.id === b[i].id && it.kind === b[i].kind && it.price.eq(b[i].price) && it.active === b[i].active)
  );
}

async function main() {
  const update = process.argv.includes("--update");
  const admin = loadKeypair("admin.json");
  const { program, programId } = loadProgram(admin);
  const pda = catalogPda(programId);

  const existing = await program.account.catalog.fetchNullable(pda);
  if (!existing) {
    console.log(`Calling initCatalog with the ${ITEMS.length} catalogue rows...`);
    const sig = await program.methods
      .initCatalog({ items: ITEMS })
      .accounts({ admin: admin.publicKey })
      .rpc({ commitment: "confirmed" }); // read back below at the same commitment
    console.log(`initCatalog tx: ${sig}`);
  } else {
    const stored = existing.items.slice(0, existing.count) as Item[];
    if (same(stored, ITEMS)) {
      console.log("Catalog already initialized and up to date:");
      console.log(describe(stored));
      return;
    }
    console.log("Stored catalog differs from ITEMS.\nStored:");
    console.log(describe(stored));
    console.log("Wanted:");
    console.log(describe(ITEMS));
    if (!update) {
      console.log("Re-run with --update to replace the stored list (setCatalog).");
      process.exitCode = 1;
      return;
    }
    const sig = await program.methods
      .setCatalog({ items: ITEMS })
      .accounts({ admin: admin.publicKey })
      .rpc({ commitment: "confirmed" }); // read back below at the same commitment
    console.log(`setCatalog tx: ${sig}`);
  }

  const readBack = await program.account.catalog.fetch(pda);
  const items = readBack.items.slice(0, readBack.count) as Item[];
  console.log(`Catalog ${pda.toBase58()} now holds:`);
  console.log(describe(items));
  if (!same(items, ITEMS)) throw new Error("catalog read back does not match ITEMS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
