import { expect, test } from "bun:test"
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Browser } from "playwright"
import {
  browserExitProbe,
  browserHandleDisposer,
  resolveExecutable,
  isMissingDisplay,
} from "./browser"

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

test("cut-short release drops inherited stdio after the dispatcher is disposed", () => {
  const calls: string[] = []
  let disposed = false
  const browser = {
    _connection: {
      toImpl: () => {
        if (disposed) throw new Error("Dispatcher was disposed")

        return {
          options: {
            browserProcess: {
              process: {
                stdio: [
                  null,
                  {
                    destroy: () => {
                      calls.push("stdout")
                    },
                  },
                  {
                    destroy: () => {
                      calls.push("stderr")
                    },
                  },
                ],
                unref: () => {
                  calls.push("unref")
                },
              },
            },
          },
        }
      },
    },
  } as unknown as Browser

  const dispose = browserHandleDisposer(browser)

  disposed = true
  dispose()
  expect(calls).toEqual(["stdout", "stderr", "unref"])
  expect(() => browserHandleDisposer({} as Browser)()).not.toThrow()
})

test("display absence is distinct from browser or encoder crashes", () => {
  expect(isMissingDisplay(new Error("Missing X server or $DISPLAY"))).toBe(true)
  expect(isMissingDisplay(new Error("Target page, context or browser has been closed"))).toBe(false)
  expect(isMissingDisplay(new Error("ffmpeg executable doesn't exist"))).toBe(false)
})

test("the exit probe reads the launched child's exit state", () => {
  const child = { exitCode: null as number | null, signalCode: null as string | null }
  const browser = {
    _connection: { toImpl: () => ({ options: { browserProcess: { process: child } } }) },
  } as unknown as Browser

  const probe = browserExitProbe(browser)

  expect(probe?.()).toBe(false)

  child.signalCode = "SIGKILL"

  expect(probe?.()).toBe(true)
  expect(browserExitProbe({} as Browser)).toBeUndefined()
})
