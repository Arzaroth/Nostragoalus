export class RateLimiter {
  private lastAt: number | null = null

  constructor(
    private readonly minIntervalMs: number,
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  async acquire(): Promise<void> {
    if (this.lastAt !== null) {
      const wait = this.minIntervalMs - (this.now() - this.lastAt)
      if (wait > 0) await this.sleep(wait)
    }
    this.lastAt = this.now()
  }
}
