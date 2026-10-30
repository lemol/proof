import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Page } from "playwright"
import sharp from "sharp"
import { run, type RunOptions, type Scenario } from "../src"
import { decodeManifest } from "../src/manifest"
import { resolveExecutable } from "../src/runner/browser"
import { fixture, temporary } from "./fixture"
import { milliseconds } from "./milliseconds"

const browserOptions = process.env.PROOF_TEST_BROWSER
  ? { executablePath: process.env.PROOF_TEST_BROWSER }
  : {}

const browserPid = async (page: Page) => {
  const session = await page.context().browser()!.newBrowserCDPSession()

  try {
    const { processInfo } = await session.send("SystemInfo.getProcessInfo")

    return processInfo.find((info) => info.type === "browser")!.id
  } finally {
    await session.detach()
  }
}

const gone = (pid: number) => {
  try {
    process.kill(pid, 0)

    return false
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") return true

    throw error
  }
}

const stuckRun = async (mode: "exited" | "alive") => {
  const output = await temporary()
  let pid = 0
  let cutAt = 0
  const stuck: Scenario = {
    id: "stuck",
    video: false,
    actions: [
      {
        name: "open",
        run: async (page) => {
          await page.goto("/")
          pid = await browserPid(page)

          const browser = page.context().browser()!

          browser.close = async () => {
            if (mode === "exited") {
              process.kill(pid, "SIGKILL")

              while (!gone(pid)) await Bun.sleep(20)
            }

            cutAt = performance.now()
            await new Promise<void>(() => {})
          }
        },
      },
    ],
  }

  try {
    const result = await run({
      ...browserOptions,
      directory: output.directory,
      scenarios: [stuck],
      scenarioIds: [stuck.id],
      launch: async () => fixture(),
      closeTimeout: 2000,
    })

    const elapsed = performance.now() - cutAt

    expect(result.outcome).toBe("passed")

    if (result.outcome === "skipped") throw new Error(result.reason)

    expect(
      decodeManifest(JSON.parse(await readFile(join(output.directory, "manifest.json"), "utf8"))),
    ).toEqual(result.manifest)
    expect(gone(pid)).toBe(true)
    expect(elapsed).toBeGreaterThanOrEqual(1900)
    expect(elapsed).toBeLessThan(mode === "exited" ? 5000 : 7000)
  } finally {
    if (pid && !gone(pid)) process.kill(pid, "SIGKILL")

    await output.close()
  }
}

test("a browser whose close never settles after it exited still publishes the manifest", async () => {
  await stuckRun("exited")
}, 20_000)

test("a browser still alive past the close bound is killed and the manifest published", async () => {
  await stuckRun("alive")
}, 60_000)

test("a browser that cannot be killed rejects at browser cleanup without a manifest", async () => {
  const output = await temporary()

  try {
    const child = await command(
      [process.execPath, join(import.meta.dir, "command.ts"), "unkillable"],
      {
        PROOF_DIR: output.directory,
        PROOF_SCENARIOS: "fixture",
      },
    )

    expect(child.exitCode).toBe(1)
    expect(child.stderr).toContain("browser cleanup")
    expect(child.stderr).toContain("is still running 1000 ms after SIGKILL")
    expect(existsSync(join(output.directory, "manifest.json"))).toBe(false)
  } finally {
    await output.close()
  }
}, 60_000)

test("inherited browser stdio cannot keep the proof command alive after release", async () => {
  const output = await temporary()
  const directory = join(output.directory, "proof")
  const wrapper = join(output.directory, "chrome")
  const holder = join(output.directory, "holder")

  try {
    const executable = await resolveExecutable(browserOptions.executablePath)

    if (!executable) throw new Error("Integration tier requires a browser")

    await mkdir(directory)
    // Like crashpad/updater, this descendant inherits Chromium's stderr but
    // outlives it. Graceful Chrome exit must not leave this pipe referenced.
    await writeFile(
      wrapper,
      `#!/bin/sh\nsleep 30 &\necho $! > '${holder}'\nexec '${executable}' "$@"\n`,
    )
    await chmod(wrapper, 0o755)

    const child = Bun.spawn([process.execPath, join(import.meta.dir, "command.ts"), "inherited"], {
      env: {
        ...Bun.env,
        PROOF_DIR: directory,
        PROOF_SCENARIOS: "fixture",
        PROOF_TEST_BROWSER: wrapper,
      },
      stdout: "pipe",
      stderr: "pipe",
    })

    const deadline = setTimeout(() => child.kill("SIGKILL"), 25_000)
    const stderr = new Response(child.stderr).text()

    try {
      expect(await child.exited).toBe(0)
      expect(await stderr).toBe("")
      expect(
        decodeManifest(JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")))
          .scenarios[0]!.outcome,
      ).toBe("passed")
      expect(gone(Number(await readFile(holder, "utf8")))).toBe(false)
    } finally {
      clearTimeout(deadline)
      child.kill("SIGKILL")
    }
  } finally {
    if (existsSync(holder)) {
      const pid = Number(await readFile(holder, "utf8"))

      if (!gone(pid)) process.kill(pid, "SIGKILL")
    }

    await output.close()
  }
}, 60_000)

const scenario: Scenario = {
  id: "fixture/change",
  masks: ["#dynamic"],
  actions: [
    {
      name: "open",
      expected: "The seeded page is visible",
      run: async (page) => {
        await page.goto("/")
        expect(await page.locator("#date").textContent()).toBe("2026-01-01T00:00:00.000Z")
      },
    },
    {
      name: "change",
      run: async (page) => {
        await page.locator("#change").click()
        expect(await page.locator("#panel").textContent()).toBe("Changed")
      },
    },
  ],
}

// Short enough to keep the tier quick, long enough to measure.
const pace = { chapter: 300, action: 300, hold: 600 }

const command = async (args: string[], env: Record<string, string | undefined> = {}) => {
  const child = Bun.spawn(args, { env: { ...Bun.env, ...env }, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).text(),
    child.exited,
  ])

  return { stdout: Buffer.from(stdout), stderr, exitCode }
}

// Settle a run before asserting on how it failed: under `expect(run()).rejects`,
// Bun answers each Playwright call about a second late (task 06).
const rejection = (proof: Promise<unknown>) =>
  proof.then(
    () => {
      throw new Error("The run resolved; it should have rejected")
    },
    (cause: unknown) => cause,
  )

test("real proofs repeat the same steps and masked WebP screenshots", async () => {
  const first = await temporary()
  const second = await temporary()

  try {
    const options = {
      ...browserOptions,
      launch: async () => fixture(),
      scenarios: [scenario],
      scenarioIds: [scenario.id],
      pace,
    }

    const a = await run({ ...options, directory: first.directory })
    const b = await run({ ...options, directory: second.directory })

    expect(a.outcome).toBe("passed")
    expect(b.outcome).toBe("passed")

    if (a.outcome === "skipped" || b.outcome === "skipped") {
      throw new Error("Integration tier requires a browser")
    }

    const manifest = decodeManifest(
      JSON.parse(await readFile(join(first.directory, "manifest.json"), "utf8")),
    )

    expect(manifest).toEqual(a.manifest)
    expect(manifest.scenarios[0]!.steps.map((step) => step.action)).toEqual(["open", "change"])

    for (const step of manifest.scenarios[0]!.steps) {
      const imageA = await readFile(join(first.directory, step.screenshot))
      const imageB = await readFile(join(second.directory, step.screenshot))

      expect((await sharp(imageA).metadata()).format).toBe("webp")
      expect(imageA.equals(imageB)).toBe(true)
    }

    const proof = manifest.scenarios[0]!

    expect(await readFile(join(first.directory, proof.chapters!), "utf8")).toContain("open")
    expect((await readFile(join(first.directory, proof.video!))).length).toBeGreaterThan(100)
    expect((await readFile(join(first.directory, proof.trace!))).subarray(0, 2).toString()).toBe(
      "PK",
    )

    const [open, change] = proof.steps

    // The chapter card plays before the first action; the first result is held,
    // then the second card plays and the click is highlighted before it lands.
    expect(milliseconds(open!.at)).toBeGreaterThanOrEqual(pace.chapter)
    expect(milliseconds(change!.at) - milliseconds(open!.at)).toBeGreaterThanOrEqual(
      pace.hold + pace.chapter + pace.action,
    )

    const ends = [
      ...(await readFile(join(first.directory, proof.chapters!), "utf8")).matchAll(
        /--> (\d+):(\d+):(\d+\.\d+)/gu,
      ),
    ].map(([, h, m, s]) => milliseconds(Number(h) * 3600 + Number(m) * 60 + Number(s)))

    // Each chapter holds its result after the screenshot.
    expect(ends[0]!).toBeGreaterThanOrEqual(milliseconds(open!.at) + pace.hold)
    expect(ends[1]!).toBeGreaterThanOrEqual(milliseconds(change!.at) + pace.hold)
    expect(ends[0]!).toBeLessThanOrEqual(milliseconds(change!.at))

    const trace = await command(["unzip", "-p", join(first.directory, proof.trace!), "trace.trace"])

    expect(trace.exitCode).toBe(0)
    expect(trace.stdout.toString()).toContain('"title":"open"')
    expect(trace.stdout.toString()).toContain('"title":"change"')

    // Sample each step strictly inside its visible interval: the runner holds
    // the captured state on screen for pace.hold after `at`, while `at` itself
    // sits on the transition edge where the recording may still show the
    // previous paint under load (frame-precision encoding, keyframe seeking).
    // SAMPLE_OFFSET must stay below pace.hold and below the gap to the next at.
    const SAMPLE_OFFSET = 0.3

    for (const [index, step] of proof.steps.entries()) {
      const next = proof.steps[index + 1]
      const sampleAt = Math.min(
        milliseconds(step.at) / 1000 + SAMPLE_OFFSET,
        next ? milliseconds(next.at) / 1000 - 0.05 : Number.POSITIVE_INFINITY,
      )

      const frame = await command([
        "ffmpeg",
        "-loglevel",
        "error",
        "-i",
        join(first.directory, proof.video!),
        "-ss",
        String(sampleAt),
        "-frames:v",
        "1",
        "-f",
        "image2pipe",
        "-vcodec",
        "png",
        "pipe:1",
      ])

      expect(frame.exitCode).toBe(0)

      const pixel = await sharp(frame.stdout)
        .extract({ left: 1000, top: 50, width: 1, height: 1 })
        .removeAlpha()
        .raw()
        .toBuffer()

      expect(pixel[index === 0 ? 0 : 1]!).toBeGreaterThan(170)
      expect(pixel[index === 0 ? 1 : 0]!).toBeLessThan(50)
    }
  } finally {
    await first.close()
    await second.close()
  }
}, 60_000)

test("app errors mentioning a display are infrastructure failures, never skipped", async () => {
  const output = await temporary()

  try {
    expect(
      await rejection(
        run({
          ...browserOptions,
          directory: output.directory,
          scenarios: [scenario],
          scenarioIds: [scenario.id],
          launch: async () => {
            throw new Error("Missing X server or $DISPLAY in app dependency")
          },
        }),
      ),
    ).toBeInstanceOf(Error)
    expect(existsSync(join(output.directory, "manifest.json"))).toBe(false)
  } finally {
    await output.close()
  }
}, 60_000)

test("a paused application clock cannot hang capture or prevent cleanup", async () => {
  const output = await temporary()
  let page: Page | undefined
  let closed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let signalPaused: () => void = () => {}
  const clockPaused = new Promise<void>((resolve) => {
    signalPaused = resolve
  })

  let signalClosing: () => void = () => {}
  const appClosing = new Promise<void>((resolve) => {
    signalClosing = resolve
  })

  const paused: Scenario = {
    id: "paused",
    video: false,
    actions: [
      {
        name: "pause",
        run: async (current) => {
          page = current
          await current.goto("/")
          await current.clock.pauseAt("2026-01-01T00:00:01.000Z")
          signalPaused()

          // A slow graceful close, as a system Chrome's can be, is cleanup
          // after capture: the watchdog must not time it.
          const browser = current.context().browser()!
          const close = browser.close.bind(browser)

          browser.close = async () => {
            await Promise.all([close(), Bun.sleep(6000)])
          }
        },
      },
    ],
  }

  const proof = run({
    ...browserOptions,
    directory: output.directory,
    scenarios: [paused],
    scenarioIds: [paused.id],
    launch: async () => {
      const app = fixture()

      return {
        ...app,
        close: async () => {
          closed = true
          signalClosing()
          await app.close()
        },
      }
    },
  })

  try {
    // Measure capture after the clock is paused, excluding browser startup.
    await Promise.race([
      clockPaused,
      proof.then(() => {
        throw new Error("Scenario did not pause its clock")
      }),
    ])

    // Capture is over once the app's close is called; the browser's close
    // follows it and is covered by the test's timeout, not this watchdog.
    await Promise.race([
      appClosing,
      proof,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("capture hung on the application clock")), 5000)
      }),
    ])

    clearTimeout(timer)

    const result = await proof

    expect(result.outcome).toBe("passed")
    expect(closed).toBe(true)
  } finally {
    clearTimeout(timer)
    await page?.context().close()
    await proof.catch(() => {})
    await output.close()
  }
}, 60_000)

test("a failed action preserves evidence, stops its scenario and continues in a fresh context", async () => {
  const output = await temporary()
  let closed = false
  let laterAction = false
  const app = fixture()
  const fail: Scenario = {
    id: "failure",
    video: false,
    actions: [
      {
        name: "reject",
        expected: "The requested item exists",
        run: async (page) => {
          await page.goto("/")
          await page.context().addCookies([{ name: "state", value: "dirty", url: app.baseURL }])
          throw new Error("Item was absent")
        },
      },
      {
        name: "unreached",
        run: async () => {
          laterAction = true
        },
      },
    ],
  }

  const fresh: Scenario = {
    id: "fresh",
    video: false,
    actions: [
      {
        name: "isolated",
        run: async (page) => {
          expect(await page.context().cookies()).toEqual([])
          await page.goto("/")
        },
      },
    ],
  }

  try {
    const result = await run({
      ...browserOptions,
      directory: output.directory,
      scenarios: [fail, fresh],
      scenarioIds: ["failure", "fresh"],
      launch: async () => ({
        ...app,
        close: async () => {
          closed = true
          await app.close()
        },
      }),
    })

    expect(result.outcome).toBe("failed")
    expect(result.exitCode).toBe(1)
    expect(laterAction).toBe(false)
    expect(closed).toBe(true)

    if (result.outcome === "skipped") throw new Error(result.reason)

    const failed = result.manifest.scenarios[0]!

    expect(failed.steps).toHaveLength(1)
    expect(failed.steps[0]).toMatchObject({
      action: "reject",
      expected: "The requested item exists",
      error: "Item was absent",
      outcome: "failed",
    })
    expect(existsSync(join(output.directory, failed.steps[0]!.screenshot))).toBe(true)
    expect(failed.video).toBeUndefined()
    expect(failed.chapters).toBeUndefined()
    expect(result.manifest.scenarios[1]!.outcome).toBe("passed")
  } finally {
    await app.close()
    await output.close()
  }
}, 60_000)

test("configuration and nonempty output fail before the app launches", async () => {
  const output = await temporary()
  let launched = false
  const options: RunOptions = {
    ...browserOptions,
    directory: output.directory,
    scenarios: [scenario],
    scenarioIds: ["missing"],
    launch: async () => {
      launched = true

      return fixture()
    },
  }

  try {
    await expect(run(options)).rejects.toThrow("missing")
    await expect(
      run({ ...options, scenarioIds: [scenario.id], executablePath: "/absent/proof-browser" }),
    ).rejects.toThrow("executable")
    await writeFile(join(output.directory, "keep.txt"), "keep")
    await expect(run({ ...options, scenarioIds: [scenario.id] })).rejects.toThrow("empty")
    expect(launched).toBe(false)
    expect(await readFile(join(output.directory, "keep.txt"), "utf8")).toBe("keep")
  } finally {
    await output.close()
  }
})

test("capture and cleanup failures reject without publishing a completed manifest", async () => {
  for (const mode of ["capture", "cleanup"] as const) {
    const output = await temporary()
    const app = fixture()
    let closed = false
    const broken: Scenario = {
      id: mode,
      video: false,
      actions: [
        {
          name: "open",
          run: async (page) => {
            await page.goto("/")

            if (mode === "capture") await page.close()
          },
        },
      ],
    }

    try {
      expect(
        await rejection(
          run({
            ...browserOptions,
            directory: output.directory,
            scenarios: [broken],
            scenarioIds: [mode],
            launch: async () => ({
              ...app,
              close: async () => {
                closed = true
                await app.close()

                if (mode === "cleanup") throw new Error("cleanup failed")
              },
            }),
          }),
        ),
      ).toBeInstanceOf(Error)
      expect(closed).toBe(true)
      expect((await readdir(output.directory)).includes("manifest.json")).toBe(false)
    } finally {
      await app.close()
      await output.close()
    }
  }
}, 60_000)

test("project commands produce 0, 1 and 3; crashes have no completed manifest", async () => {
  for (const [mode, expected] of [
    ["pass", 0],
    ["fail", 1],
    ["unavailable", 3],
    ["crash", 1],
    ["encoder", 1],
  ] as const) {
    const output = await temporary()

    try {
      const child = await command([process.execPath, join(import.meta.dir, "command.ts"), mode], {
        PROOF_DIR: output.directory,
        PROOF_SCENARIOS: "fixture",
        ...(mode === "encoder" ? { PLAYWRIGHT_BROWSERS_PATH: output.directory } : {}),
      })

      expect(child.exitCode).toBe(expected)

      if (mode === "pass" || mode === "fail") {
        const manifest = decodeManifest(
          JSON.parse(await readFile(join(output.directory, "manifest.json"), "utf8")),
        )

        expect(manifest.scenarios[0]!.outcome).toBe(mode === "pass" ? "passed" : "failed")
      } else {
        expect(existsSync(join(output.directory, "manifest.json"))).toBe(false)
        expect(child.stderr).toContain(
          mode === "unavailable"
            ? "No installed Chromium"
            : mode === "encoder"
              ? "ffmpeg"
              : "Fixture startup broke",
        )
      }
    } finally {
      await output.close()
    }
  }
}, 60_000)

test("an empty finalized video cannot be published as a passing proof", async () => {
  const output = await temporary()

  try {
    expect(
      await rejection(
        run({
          ...browserOptions,
          directory: output.directory,
          scenarios: [scenario],
          scenarioIds: [scenario.id],
          launch: async () => {
            const app = fixture()

            return {
              ...app,
              close: async () => {
                await app.close()
                await writeFile(join(output.directory, "scenario-001/video.webm"), "")
              },
            }
          },
        }),
      ),
    ).toBeInstanceOf(Error)
    expect(existsSync(join(output.directory, "manifest.json"))).toBe(false)
  } finally {
    await output.close()
  }
}, 60_000)

test("a renderer failure preserves an already captured screenshot", async () => {
  const output = await temporary()
  const broken: Scenario = {
    id: "render",
    video: false,
    actions: [
      {
        name: "open",
        run: async (page) => {
          await page.goto("/")
          page.context().newCDPSession = async () => {
            throw new Error("renderer connection failed")
          }
        },
      },
    ],
  }

  try {
    expect(
      await rejection(
        run({
          ...browserOptions,
          directory: output.directory,
          scenarios: [broken],
          scenarioIds: [broken.id],
          launch: async () => fixture(),
        }),
      ),
    ).toBeInstanceOf(Error)
    expect(
      (await sharp(join(output.directory, "scenario-001/step-001.webp")).metadata()).format,
    ).toBe("webp")
    expect(existsSync(join(output.directory, "manifest.json"))).toBe(false)
  } finally {
    await output.close()
  }
}, 60_000)
