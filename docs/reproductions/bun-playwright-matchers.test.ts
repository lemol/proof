import { expect, test } from "bun:test"
import { chromium } from "playwright"

// Upstream reproduction: one yielded timer turn before driving Playwright
// makes every subsequent Playwright call settle about a second late when the
// driving promise is awaited through Bun's resolves/rejects matchers, while
// the same calls under a plain await settle in milliseconds.
//
// Copy this file alone next to an installed `playwright` dependency and run:
//   DEBUG=pw:api bun test bun-playwright-matchers.test.ts --timeout 60000 -t '^await$'
//   DEBUG=pw:api bun test bun-playwright-matchers.test.ts --timeout 60000 -t '^resolves$'
//   DEBUG=pw:api bun test bun-playwright-matchers.test.ts --timeout 60000 -t '^reject-await$'
//   DEBUG=pw:api bun test bun-playwright-matchers.test.ts --timeout 60000 -t '^rejects$'
// or set PROOF_TEST_BROWSER to an installed Chromium executable.

const resolveExecutable = async (): Promise<string> => {
  if (process.env.PROOF_TEST_BROWSER) return process.env.PROOF_TEST_BROWSER

  const path = chromium.executablePath()

  if (!(await Bun.file(path).exists())) {
    throw new Error(`No installed Chromium browser is available at ${path}`)
  }

  return path
}

async function exercise(): Promise<"complete"> {
  const browser = await chromium.launch({ executablePath: await resolveExecutable() })

  try {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto("about:blank")
    await context.close()

    return "complete" as const
  } finally {
    await browser.close()
  }
}

for (const mode of ["await", "resolves", "reject-await", "rejects"] as const) {
  test(
    mode,
    async () => {
      // The trigger: yield one timer turn before creating the driving promise.
      // Removing this line makes every mode fast; keeping it slows only the
      // resolves/rejects matchers. Yielding the same turn from inside
      // exercise() does not reproduce.
      await Bun.sleep(0)

      if (mode === "await") {
        expect(await exercise()).toBe("complete")
      } else if (mode === "resolves") {
        await expect(exercise()).resolves.toBe("complete")
      } else {
        const promise = exercise().then(() => {
          throw new Error("reproduction sentinel")
        })

        if (mode === "rejects") {
          await expect(promise).rejects.toThrow("reproduction sentinel")
        } else {
          const error = await promise.then(
            () => null,
            (cause: unknown) => cause,
          )

          expect(error).toBeInstanceOf(Error)
          expect((error as Error).message).toBe("reproduction sentinel")
        }
      }
    },
    60000,
  )
}
