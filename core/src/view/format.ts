// Display formatters for the app's UI. They sit outside the deterministic simulation.

/** 18920 -> "18,920". The fraction is dropped. */
export function formatInt(value: number): string {
  const n = Math.trunc(value);
  const grouped = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return n < 0 ? `-${grouped}` : grouped;
}

const twoDigits = (n: number) => (n < 10 ? `0${n}` : `${n}`);

/** Seconds as HH:MM:SS: 18764 -> "05:12:44". Negative time shows as zero. */
export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${twoDigits(h)}:${twoDigits(m)}:${twoDigits(s)}`;
}

/** A wallet address as its first 4 and last 3 characters: "7xKp…3fQ". */
export function shortAddress(address: string): string {
  return address.length <= 8 ? address : `${address.slice(0, 4)}…${address.slice(-3)}`;
}
