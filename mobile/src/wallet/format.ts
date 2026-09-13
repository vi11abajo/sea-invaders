import { formatInt } from '@sea-invaders/core';

const LAMPORT_DIGITS = 9;
/** 0.01 SOL: from here up the balance pill shows 2 decimals (`0.31 SOL`), below it 4. */
const CENT_LAMPORTS = 10_000_000;
/** 0.0001 SOL: below this a 4-decimal amount would read as zero, so all 9 digits show, trimmed. */
const TEN_THOUSANDTH_LAMPORTS = 100_000;

/** `lamports` as SOL with `decimals` places, rounded `up` (a cost) or `down` (a balance). */
function fixedSol(lamports: number, decimals: number, round: 'up' | 'down'): string {
  const unit = 10 ** (LAMPORT_DIGITS - decimals);
  const units = round === 'up' ? Math.ceil(lamports / unit) : Math.floor(lamports / unit);
  const scale = 10 ** decimals;
  const whole = formatInt(Math.floor(units / scale));
  return decimals === 0 ? whole : `${whole}.${String(units % scale).padStart(decimals, '0')}`;
}

function solText(lamports: number, decimals: number, round: 'up' | 'down'): string {
  const value = Math.max(0, Math.round(lamports));
  if (value === 0) return '0';
  if (value < TEN_THOUSANDTH_LAMPORTS && decimals <= 4) return fixedSol(value, LAMPORT_DIGITS, round).replace(/0+$/, '');
  return fixedSol(value, decimals, round);
}

/** A wallet's SOL for the balance pill: `0.31` (2 decimals from 0.01 SOL, 4 below), never rounded up. */
export function formatSolBalance(lamports: number): string {
  return solText(lamports, lamports >= CENT_LAMPORTS ? 2 : 4, 'down');
}

/** A SOL amount in a sheet (`0.0021`): 4 decimals, or every digit when smaller (`0.000005`). Costs round up, holdings down. */
export function formatSolAmount(lamports: number, round: 'up' | 'down'): string {
  return solText(lamports, 4, round);
}

/** A price quoted in SOL (`0.476`), rounded up so it never understates the cost. */
export function formatSolPrice(sol: number): string {
  return solText(sol * 10 ** LAMPORT_DIGITS, 3, 'up');
}

/** SKR for display: whole amounts grouped (`1,240`), otherwise at most two decimals, truncated (`12.5`, `0.25`). */
export function formatSkr(value: number): string {
  const hundredths = Math.floor(Math.max(0, value) * 100 + 1e-6);
  const whole = formatInt(Math.floor(hundredths / 100));
  const cents = hundredths % 100;
  if (cents === 0) return whole;
  return `${whole}.${String(cents).padStart(2, '0').replace(/0$/, '')}`;
}
