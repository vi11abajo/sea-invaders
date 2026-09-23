import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { chainConfig } from './config.js';

function toPublicKey(value) {
  return value instanceof PublicKey ? value : new PublicKey(value);
}

function u32LE(value) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value, 0);
  return buf;
}

/** The singleton `config` PDA (seeds = [b"config"]). */
export function configPda() {
  return PublicKey.findProgramAddressSync([Buffer.from('config')], chainConfig().programId)[0];
}

/** A wallet's `player` PDA (seeds = [b"player", wallet]). */
export function playerPda(wallet) {
  const walletKey = toPublicKey(wallet);
  return PublicKey.findProgramAddressSync([Buffer.from('player'), walletKey.toBytes()], chainConfig().programId)[0];
}

/** A week's `week_pool` PDA (seeds = [b"week", week.to_le_bytes()], week: u32). */
export function weekPda(week) {
  return PublicKey.findProgramAddressSync([Buffer.from('week'), u32LE(week)], chainConfig().programId)[0];
}

/** A Seeker Genesis Token mint's `seeker_link` PDA (seeds = [b"seeker", sgt_mint]) - one per mint, which is what makes the chain itself enforce one token per player. */
export function seekerLinkPda(sgtMint) {
  const mintKey = toPublicKey(sgtMint);
  return PublicKey.findProgramAddressSync([Buffer.from('seeker'), mintKey.toBytes()], chainConfig().programId)[0];
}

/** The singleton `catalog` PDA (seeds = [b"catalog", b"v2"]). The version seed moved the
 * account rather than migrating it in place: the grown, 64-row `Catalog` layout cannot be
 * read back through the old 16-row account, which is abandoned on devnet since 2026-09-23. */
export function catalogPda() {
  return PublicKey.findProgramAddressSync([Buffer.from('catalog'), Buffer.from('v2')], chainConfig().programId)[0];
}

/** The associated token account for `owner` (a wallet or a PDA) and `mint`. Always allows an off-curve owner, since callers pass both wallets and PDAs (e.g. the week-pool vault). */
export function ata(owner, mint) {
  return getAssociatedTokenAddressSync(toPublicKey(mint), toPublicKey(owner), true);
}
