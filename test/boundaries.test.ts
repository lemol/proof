import { expect, test } from "bun:test"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

test("manifest has no runtime dependencies except Effect", async () => {
  const dir = join(import.meta.dir, "../src/manifest")

  for (const file of await readdir(dir, { recursive: true })) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue

    const text = await readFile(join(dir, file), "utf8")
    const imports = [...text.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)["']/gu)]

    for (const match of imports) expect(match[1]).toBe("effect")
  }
})
