import { fixture } from "./fixture"

const mode = process.argv[2]

if (mode === "unavailable") {
  // Keep discovery deterministic on hosts that have a system browser.
  // The runner, environment input, launch guard and process result are real.
  const { mock } = await import("bun:test")

  mock.module("../src/runner/browser", () => ({
    resolveExecutable: async () => undefined,
    isMissingDisplay: () => false,
    browserHandleDisposer: () => () => {},
    browserExitProbe: () => undefined,
    browserProcessId: async () => {
      throw new Error("Unavailable browser has no process")
    },
  }))
}

if (mode === "unkillable") {
  const { mock } = await import("bun:test")

  mock.module("../src/runner/process", () => ({ alive: () => true, kill: () => {} }))

  // The real close still exits the child, which would now count as released.
  const browser = await import("../src/runner/browser")

  mock.module("../src/runner/browser", () => ({ ...browser, browserExitProbe: () => () => false }))
}

const { run } = await import("../src")
const result = await run({
  ...(mode === "unkillable" ? { closeTimeout: 1000 } : {}),
  ...(mode === "inherited" ? { closeTimeout: 15_000 } : {}),
  ...(process.env.PROOF_TEST_BROWSER ? { executablePath: process.env.PROOF_TEST_BROWSER } : {}),
  launch: async () => {
    if (mode === "unavailable") throw new Error("Unavailable browser must not launch the app")

    if (mode === "crash") throw new Error("Fixture startup broke")

    return fixture()
  },
  scenarios: [
    {
      id: "fixture",
      video: mode === "encoder",
      actions: [
        {
          name: "open",
          expected: "The fixture works",
          run: async (page) => {
            await page.goto("/")

            if (mode === "unkillable") {
              const browser = page.context().browser()!
              const close = browser.close.bind(browser)

              browser.close = () => {
                void close()

                return new Promise<void>(() => {})
              }
            }

            if (mode === "fail") throw new Error("Fixture expectation failed")
          },
        },
      ],
    },
  ],
})

if (result.outcome === "skipped") console.error(result.reason)

process.exitCode = result.exitCode
