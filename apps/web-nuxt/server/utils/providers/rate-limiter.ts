export class RateLimiter {
  // The next instant a request may go out, NOT the last one that did. Reserving
  // the slot before sleeping is what makes the limiter hold under concurrency:
  // recording it afterwards let every concurrent caller read the same value,
  // compute the same wait and resume together, so N callers fired as a burst of
  // N and the configured interval bought nothing.
  private nextAt: number | null = null

  constructor(
    private readonly minIntervalMs: number,
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  async acquire(): Promise<void> {
    const now = this.now()
    const at = this.nextAt === null ? now : Math.max(now, this.nextAt)
    this.nextAt = at + this.minIntervalMs
    const wait = at - now
    if (wait > 0) await this.sleep(wait)
  }
}
