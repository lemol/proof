import { access, readdir, rename, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Effect } from "effect"
import { chromium, type Browser } from "playwright"
import { decodeManifest, type ScenarioProof } from "../manifest"
import {
  browserProcessId,
  browserHandleDisposer,
  isMissingDisplay,
  resolveExecutable,
} from "./browser"
import { captureScenario } from "./capture"
import { configure, launchOptions } from "./config"
import { combineErrors, diagnostic, ProofError } from "./errors"
import { releaseBrowser } from "./release"
import type { RunOptions, RunResult } from "./types"

export type { Action, App, RunOptions, RunResult, Scenario } from "./types"
export { ProofError } from "./errors"

const attempt = <A>(stage: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new ProofError({ stage, message: `${stage}: ${diagnostic(cause)}`, cause }),
  })

export const run = async (options: RunOptions): Promise<RunResult> => {
  const config = configure(options)

  if ((await readdir(config.directory)).length > 0) {
    throw new Error("Proof output directory must be empty")
  }

  const executablePath = await resolveExecutable(config.executablePath)

  if (!executablePath) {
    return { outcome: "skipped", exitCode: 3, reason: "No installed Chromium browser is available" }
  }

  let browser: Browser

  try {
    browser = await chromium.launch(launchOptions(config, executablePath))
  } catch (cause) {
    if (isMissingDisplay(cause)) {
      return { outcome: "skipped", exitCode: 3, reason: diagnostic(cause) }
    }

    throw new ProofError({
      stage: "browser launch",
      message: `browser launch: ${diagnostic(cause)}`,
      cause,
    })
  }

  const cleanupErrors: unknown[] = []

  const release = (stage: string, close: () => Promise<void>) =>
    attempt(stage, close).pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          cleanupErrors.push(error)
        }),
      ),
    )

  let primary: { error: unknown } | undefined
  let proofs: ScenarioProof[] | undefined

  try {
    proofs = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          let pid: number | undefined
          const dropHandles = browserHandleDisposer(browser)

          yield* Effect.acquireRelease(Effect.succeed(browser), (browser) =>
            release("browser cleanup", async () => {
              const released = await releaseBrowser(() => browser.close(), pid, config.closeTimeout)

              if (released !== "closed") dropHandles()
            }),
          )

          pid = yield* attempt("browser process", () => browserProcessId(browser))

          const app = yield* Effect.acquireRelease(attempt("app launch", config.launch), (app) =>
            release("app cleanup", () => app.close()),
          )

          const baseURL = new URL(app.baseURL)

          if (baseURL.protocol !== "http:" && baseURL.protocol !== "https:") {
            throw new Error("App baseURL must use http or https")
          }

          const results: ScenarioProof[] = []

          for (const [index, scenario] of config.scenarios.entries()) {
            const proof = yield* Effect.scoped(
              Effect.gen(function* () {
                const context = yield* Effect.acquireRelease(
                  attempt("browser context", () =>
                    browser.newContext({
                      baseURL: baseURL.href,
                      viewport: scenario.viewport ?? config.viewport,
                      reducedMotion: "reduce",
                      locale: config.locale,
                      timezoneId: config.timezoneId,
                      deviceScaleFactor: config.deviceScaleFactor,
                      colorScheme: config.colorScheme,
                    }),
                  ),
                  (context) => release("context cleanup", () => context.close()),
                )

                context.setDefaultTimeout(config.timeout)
                context.setDefaultNavigationTimeout(config.timeout)

                return yield* attempt(`scenario ${scenario.id}`, () =>
                  captureScenario(context, scenario, index + 1, config),
                )
              }),
            )

            results.push(proof)
          }

          return results
        }),
      ),
    )
  } catch (error) {
    primary = { error }
  }

  combineErrors(primary, cleanupErrors)

  const manifest = decodeManifest({ version: 1, scenarios: proofs })

  for (const scenario of manifest.scenarios) {
    const files = [
      ...scenario.steps.map((step) => step.screenshot),
      scenario.video,
      scenario.chapters,
      scenario.trace,
    ].filter((path): path is string => path !== undefined)

    for (const path of files) {
      await access(join(config.directory, path))

      const artifact = await stat(join(config.directory, path))

      if (!artifact.isFile() || artifact.size === 0) {
        throw new Error(`Artifact must be a nonempty file: ${path}`)
      }
    }
  }

  const temporaryPath = join(config.directory, "manifest.json.tmp")

  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" })
  await rename(temporaryPath, join(config.directory, "manifest.json"))

  return manifest.scenarios.some((scenario) => scenario.outcome === "failed")
    ? { outcome: "failed", exitCode: 1, manifest }
    : { outcome: "passed", exitCode: 0, manifest }
}
