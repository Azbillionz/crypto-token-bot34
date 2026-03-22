import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const CACHE_FILE = join(process.cwd(), "seen-tokens.json");

let seen: Set<string>;

function load(): Set<string> {
  if (seen) return seen;
  try {
    if (existsSync(CACHE_FILE)) {
      const data = JSON.parse(readFileSync(CACHE_FILE, "utf-8")) as string[];
      seen = new Set(data);
    } else {
      seen = new Set();
    }
  } catch {
    seen = new Set();
  }
  return seen;
}

function persist(): void {
  try {
    writeFileSync(CACHE_FILE, JSON.stringify([...seen]), "utf-8");
  } catch {
  }
}

export function hasSeen(ca: string): boolean {
  return load().has(ca);
}

export function markSeen(ca: string): void {
  load().add(ca);
  persist();
}
