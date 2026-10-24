import { expect, test } from "bun:test"
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resolveExecutable, isMissingDisplay } from "./browser"

test("explicit executable wins, then system, then installed Playwright", async () => {
  const dir = await mkdtemp(join(tmpdir(), "proof-browser-"))

  try {
    const paths = ["explicit", "system", "bundled"].map((name) => join(dir, name))

    for (const path of paths) {
      await writeFile(path, "#!/bin/sh\nexit 0\n")
      await chmod(path, 0o755)
    }

    expect(await resolveExecutable(paths[0], [paths[1]!], paths[2])).toBe(paths[0]!)
    expect(await resolveExecutable(undefined, [paths[1]!], paths[2])).toBe(paths[1]!)
    expect(await resolveExecutable(undefined, [], paths[2])).toBe(paths[2]!)
    expect(await resolveExecutable(undefined, [], join(dir, "absent"))).toBeUndefined()
    await expect(resolveExecutable(join(dir, "absent"), [], paths[2])).rejects.toThrow("executable")
    await expect(resolveExecutable(dir, [], paths[2])).rejects.toThrow("executable")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("display absence is distinct from browser or encoder crashes", () => {
  expect(isMissingDisplay(new Error("Missing X server or $DISPLAY"))).toBe(true)
  expect(isMissingDisplay(new Error("Target page, context or browser has been closed"))).toBe(false)
  expect(isMissingDisplay(new Error("ffmpeg executable doesn't exist"))).toBe(false)
})
