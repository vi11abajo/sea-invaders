import { TICKS_PER_SECOND } from '../fixed';

/** Turns wall-clock frame times into whole simulation ticks. Not part of the deterministic simulation. */
export class FixedStepper {
  private last: number | null = null;
  private acc = 0;

  constructor(
    private readonly tickMs = 1000 / TICKS_PER_SECOND,
    private readonly maxTicksPerFrame = 4,
  ) {}

  /** Ticks to simulate for a frame drawn at `nowMs`. The first call only starts the clock. */
  advance(nowMs: number): number {
    if (this.last === null) {
      this.last = nowMs;
      return 0;
    }
    const dt = Math.max(0, nowMs - this.last);
    this.last = nowMs;
    this.acc = Math.min(this.acc + dt, this.tickMs * this.maxTicksPerFrame);
    let ticks = 0;
    while (this.acc + 1e-6 >= this.tickMs) {
      this.acc -= this.tickMs;
      ticks += 1;
    }
    return ticks;
  }

  reset(): void {
    this.last = null;
    this.acc = 0;
  }
}
