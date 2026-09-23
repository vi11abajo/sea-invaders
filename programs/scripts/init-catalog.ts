/**
 * Creates the devnet `Catalog` with the seven shop items: ids 0-2 are the campaign octopi
 * (Harpoon, Anchor, Trident - priced at $1, $2 and $3 in SKR, rounded UP to a whole SKR at the
 * rate of the day the list was set: $0.01808/SKR on 2026-09-15 -> 56, 111, 166 SKR), ids 3-6 the
 * Octopi skins (Lime 25, Lilac 25, Ember 35, Abyss 50 SKR). Prices are stored on chain in SKR base
 * units (6 decimals); the backend and the app read them from there, never from this file. To
 * follow the rate, edit the three variant prices and run with `--update`. The catalogue now
 * lives at the PDA seeded `[b"catalog", b"v2"]` (64-row layout); the old single-seed account
 * is abandoned on devnet since 2026-09-23.
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
 *   KEYS_DIR             default /mnt/d/dev/keys - reads admin.json from here (secrets never
 *                        printed).
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

/** The catalogue of the shop design: one-time purchases, ids are the inventory bits. */
const ITEMS: Item[] = [
  { id: 0, kind: VARIANT, price: new BN(56 * SKR), active: true }, // Harpoon ($1)
  { id: 1, kind: VARIANT, price: new BN(111 * SKR), active: true }, // Anchor ($2)
  { id: 2, kind: VARIANT, price: new BN(166 * SKR), active: true }, // Trident ($3)
  { id: 3, kind: SKIN, price: new BN(25 * SKR), active: true }, // Lime
  { id: 4, kind: SKIN, price: new BN(25 * SKR), active: true }, // Lilac
  { id: 5, kind: SKIN, price: new BN(35 * SKR), active: true }, // Ember
  { id: 6, kind: SKIN, price: new BN(50 * SKR), active: true }, // Abyss
];

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
    console.log("Calling initCatalog with the seven shop items...");
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
