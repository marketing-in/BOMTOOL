/** Per-minute token bucket. `take()` returns 0 when allowed, otherwise ms to wait. */
export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(
    private readonly perMinute: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = perMinute;
    this.last = now();
  }

  private refill() {
    const t = this.now();
    const elapsed = t - this.last;
    this.last = t;
    this.tokens = Math.min(this.perMinute, this.tokens + (elapsed / 60_000) * this.perMinute);
  }

  take(): number {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }
    return Math.ceil(((1 - this.tokens) / this.perMinute) * 60_000);
  }
}

/** Calendar day in India (IST, UTC+5:30) — distributor daily quotas are counted per day. */
export function istDayKey(d = new Date()): string {
  return new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

export class BudgetExceededError extends Error {
  constructor(readonly adapter: string, readonly limit: number) {
    super(`${adapter}: daily API budget of ${limit} calls used up`);
  }
}
