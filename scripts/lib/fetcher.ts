import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export const CACHE_DIR = path.join(process.cwd(), "data", "cache");
const HTTP_DIR = path.join(CACHE_DIR, "http");

// Token bucket. OpenAlex's polite pool allows ~10 req/s with a mailto;
export class RateLimiter {
  private queue: Promise<void> = Promise.resolve();
  private last = 0;
  private rate: number;

  constructor(perSecond: number) {
    this.rate = perSecond;
  }

  // Slow down permanently after a 429: a limit tripped once will trip again.
  throttle() {
    this.rate = Math.max(1, this.rate * 0.6);
    console.warn(`  rate limited — dropping to ${this.rate.toFixed(1)} req/s`);
  }

  acquire(): Promise<void> {
    const gap = 1000 / this.rate;
    this.queue = this.queue.then(async () => {
      const wait = this.last + gap - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.last = Date.now();
    });
    return this.queue;
  }
}

const key = (url: string) => createHash("sha1").update(url).digest("hex");

// GET with an on-disk cache, so re-runs never re-hit the APIs.
export async function getJSON<T>(
  url: string,
  limiter: RateLimiter,
  opts: { retries?: number; label?: string } = {},
): Promise<T> {
  await mkdir(HTTP_DIR, { recursive: true });
  const file = path.join(HTTP_DIR, `${key(url)}.json`);

  if (existsSync(file)) {
    return JSON.parse(await readFile(file, "utf8")) as T;
  }

  const retries = opts.retries ?? 6;
  let lastErr: unknown;
  let penalty = 0;

  for (let attempt = 0; attempt <= retries; attempt++) {
    await limiter.acquire();

    // A 429 is the shared limiter's problem, not just this request's.
    // slow the shared limiter for every caller, not only this request.
    if (penalty > 0) {
      await new Promise((r) => setTimeout(r, penalty));
    }

    try {
      const res = await fetch(url, {
        headers: {
          // Both APIs use this to identify polite clients.
          "User-Agent": `PRION/0.1 (mailto:${process.env.OPENALEX_MAILTO ?? "unknown"})`,
          Accept: "application/json",
        },
      });

      if (res.status === 429) {
        // Honour Retry-After when sent; OpenAlex wants seconds after a burst.
        // hard. OpenAlex wants seconds, not milliseconds, after a burst.
        const header = Number(res.headers.get("retry-after"));
        penalty = Number.isFinite(header) && header > 0
          ? header * 1000
          : Math.min(5000 * 2 ** attempt, 60_000);
        limiter.throttle();
        throw new Error(`HTTP 429 (backing off ${Math.round(penalty / 1000)}s)`);
      }

      if (res.status >= 500) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (res.status === 404) {
        // A genuine "not in this registry" — cache it so we don't re-ask.
        const miss = { __prion_missing: true } as unknown as T;
        await writeFile(file, JSON.stringify(miss));
        return miss;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const body = (await res.json()) as T;
      await writeFile(file, JSON.stringify(body));
      return body;
    } catch (err) {
      lastErr = err;
      const backoff = Math.min(2 ** attempt * 500, 8000);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  throw new Error(
    `Failed after ${retries} retries: ${opts.label ?? url} — ${String(lastErr)}`,
  );
}

export function isMissing(v: unknown): boolean {
  return !!v && typeof v === "object" && "__prion_missing" in v;
}

export async function appendNDJSON(file: string, rows: unknown[]) {
  if (rows.length === 0) return;
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

export async function readNDJSON<T>(file: string): Promise<T[]> {
  if (!existsSync(file)) return [];
  const text = await readFile(file, "utf8");
  return text
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as T);
}

// Resumable checkpoint so a crash costs you minutes, not hours.
export async function loadCheckpoint(name: string): Promise<string | null> {
  const file = path.join(CACHE_DIR, `${name}.checkpoint`);
  if (!existsSync(file)) return null;
  return (await readFile(file, "utf8")).trim() || null;
}

export async function saveCheckpoint(name: string, value: string) {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(path.join(CACHE_DIR, `${name}.checkpoint`), value);
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`\n  Missing ${name}. Copy .env.example to .env.local and fill it in.\n`);
    process.exit(1);
  }
  return v;
}
