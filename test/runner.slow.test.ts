import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { readFile, readdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Page } from "playwright"
import sharp from "sharp"
import { run, type RunOptions, type Scenario } from "../src"
import { decodeManifest } from "../src/manifest"
import { fixture, temporary } from "./fixture"

const browserOptions = process.env.PROOF_TEST_BROWSER
  ? { executablePath: process.env.PROOF_TEST_BROWSER }
  : {}

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

const command = async (args: string[], env: Record<string, string | undefined> = {}) => {
  const child = Bun.spawn(args, { env: { ...Bun.env, ...env }, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).text(),
    child.exited,
  ])

  return { stdout: Buffer.from(stdout), stderr, exitCode }
}

test("real proofs repeat the same steps and masked WebP screenshots", async () => {
  const first = await temporary()
  const second = await temporary()

  try {
    const options = {
      ...browserOptions,
      launch: async () => fixture(),
      scenarios: [scenario],
      scenarioIds: [scenario.id],
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

    const trace = await command(["unzip", "-p", join(first.directory, proof.trace!), "trace.trace"])

    expect(trace.exitCode).toBe(0)
    expect(trace.stdout.toString()).toContain('"title":"open"')
    expect(trace.stdout.toString()).toContain('"title":"change"')

    for (const [index, step] of proof.steps.entries()) {
      const frame = await command([
        "ffmpeg",
        "-loglevel",
        "error",
        "-ss",
        String(step.at),
        "-i",
        join(first.directory, proof.video!),
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
    await expect(
      run({
        ...browserOptions,
        directory: output.directory,
        scenarios: [scenario],
        scenarioIds: [scenario.id],
        launch: async () => {
          throw new Error("Missing X server or $DISPLAY in app dependency")
        },
      }),
    ).rejects.toThrow()
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

    const result = await Promise.race([
      proof,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("capture hung on the application clock")), 5000)
      }),
    ])

    expect(result.outcome).toBe("passed")
    expect(closed).toBe(true)
  } finally {
    clearTimeout(timer)
    await page?.context().close()
    await proof.catch(() => {})
    await output.close()
  }
}, 15_000)

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
      await expect(
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
      ).rejects.toThrow()
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
        NZILA_PROVE_DIR: output.directory,
        NZILA_PROVE_SCENARIOS: "fixture",
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
    await expect(
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
    ).rejects.toThrow()
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
    await expect(
      run({
        ...browserOptions,
        directory: output.directory,
        scenarios: [broken],
        scenarioIds: [broken.id],
        launch: async () => fixture(),
      }),
    ).rejects.toThrow()
    expect(
      (await sharp(join(output.directory, "scenario-001/step-001.webp")).metadata()).format,
    ).toBe("webp")
    expect(existsSync(join(output.directory, "manifest.json"))).toBe(false)
  } finally {
    await output.close()
  }
}, 60_000)
