import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { BrowserContext } from "playwright"
import sharp from "sharp"
import type { ScenarioProof, StepProof } from "../manifest"
import { writeChapters } from "./chapters"
import type { Configuration } from "./config"
import { combineErrors, diagnostic } from "./errors"
import { renderFrame } from "./render"
import type { Scenario } from "./types"

export const captureScenario = async (
  context: BrowserContext,
  scenario: Scenario,
  ordinal: number,
  config: Configuration,
): Promise<ScenarioProof> => {
  const prefix = `scenario-${String(ordinal).padStart(3, "0")}`
  const folder = join(config.directory, prefix)
  const cleanups: (() => Promise<void>)[] = []
  const steps: StepProof[] = []
  const cues: { action: string; end: number }[] = []
  let primary: { error: unknown } | undefined
  let origin = performance.now()

  await mkdir(folder)

  try {
    const page = await context.newPage()

    await page.clock.setFixedTime(config.fixedTime)

    if (scenario.video !== false) {
      let resolveFirst: (time: number) => void = () => {}
      let seenFirst = false
      const firstFrame = new Promise<number>((resolve) => {
        resolveFirst = resolve
      })

      await page.screencast.start({
        path: join(folder, "video.webm"),
        size: scenario.viewport ?? config.viewport,
        onFrame: () => {
          if (!seenFirst) {
            seenFirst = true
            resolveFirst(performance.now())
          }
        },
      })
      cleanups.push(() => page.screencast.stop())

      let timer: ReturnType<typeof setTimeout> | undefined

      try {
        origin = await Promise.race([
          firstFrame,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("No recording frame received")),
              config.timeout,
            )
          }),
        ])
      } finally {
        clearTimeout(timer)
      }

      // Highlight each click, fill and key press and pause before it lands,
      // so a person watching sees where the action acts.
      if (config.pace.action > 0) {
        await page.screencast.showActions({ duration: config.pace.action })
      }
    }

    // Start video first: tracing otherwise establishes an 800px screencast
    // that takes precedence over the requested recording viewport.
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false })
    cleanups.push(() => context.tracing.stop({ path: join(folder, "trace.zip") }))

    for (const [index, action] of scenario.actions.entries()) {
      await context.tracing.group(action.name)

      try {
        if (scenario.video !== false) {
          await page.screencast.showOverlays()

          if (config.pace.chapter > 0) {
            await page.screencast.showChapter(action.name, {
              duration: config.pace.chapter,
              ...(action.expected !== undefined ? { description: action.expected } : {}),
            })
          }
        }

        let failure: { error: unknown } | undefined

        try {
          await action.run(page)
        } catch (error) {
          failure = { error }
        }

        if (scenario.video !== false) await page.screencast.hideOverlays()

        const screenshot = `${prefix}/step-${String(index + 1).padStart(3, "0")}.webp`
        const png = await page.screenshot({
          type: "png",
          animations: "disabled",
          caret: "hide",
          scale: "css",
          mask: (scenario.masks ?? []).map((selector) => page.locator(selector)),
          timeout: config.timeout,
        })

        await sharp(png).webp({ lossless: true }).toFile(join(config.directory, screenshot))

        // The screenshot can finish before its state is delivered to the
        // recorder. Flush native renderer frames before closing the step.
        // The recording origin is its first delivered frame; 1.59 does not
        // expose individual frame timestamps to library callers.
        await renderFrame(page, config.timeout)

        const at = Math.max(
          steps.at(-1)?.at ?? 0.001,
          Math.round(performance.now() - origin) / 1000,
        )

        steps.push({
          action: action.name,
          outcome: failure ? "failed" : "passed",
          screenshot,
          at,
          ...(action.expected !== undefined ? { expected: action.expected } : {}),
          ...(failure ? { error: diagnostic(failure.error) } : {}),
        })

        // Hold the captured state on the recording so a person can read it
        // before the next chapter; the step's chapter ends after the hold.
        if (scenario.video !== false && config.pace.hold > 0) {
          await new Promise((resolve) => setTimeout(resolve, config.pace.hold))
        }

        cues.push({
          action: action.name,
          end: Math.max(at, Math.round(performance.now() - origin) / 1000),
        })

        if (failure) break
      } finally {
        await context.tracing.groupEnd()
      }
    }
  } catch (error) {
    primary = { error }
  }

  const cleanupErrors: unknown[] = []

  for (const close of cleanups.toReversed()) {
    try {
      await close()
    } catch (error) {
      cleanupErrors.push(error)
    }
  }

  combineErrors(primary, cleanupErrors)

  if (scenario.video !== false) await writeFile(join(folder, "chapters.vtt"), writeChapters(cues))

  return {
    id: scenario.id,
    outcome: steps.some((step) => step.outcome === "failed") ? "failed" : "passed",
    steps: steps as [StepProof, ...StepProof[]],
    trace: `${prefix}/trace.zip`,
    ...(scenario.video !== false
      ? { video: `${prefix}/video.webm`, chapters: `${prefix}/chapters.vtt` }
      : {}),
  }
}
