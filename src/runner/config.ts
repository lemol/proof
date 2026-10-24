import { resolve } from "node:path"
import { Predicate, Schema } from "effect"
import type { RunOptions, Scenario } from "./types"

const Text = Schema.String.check(Schema.isPattern(/\S/u))
const Positive = Schema.Finite.check(Schema.isGreaterThan(0))
const Viewport = Schema.Struct({
  width: Schema.Int.check(Schema.isGreaterThan(0)),
  height: Schema.Int.check(Schema.isGreaterThan(0)),
})

const Definitions = Schema.Array(
  Schema.Struct({
    id: Text,
    actions: Schema.NonEmptyArray(
      Schema.Struct({
        name: Text,
        expected: Schema.optionalKey(Text),
        run: Schema.Unknown.check(
          Schema.makeFilter((value) =>
            Predicate.isFunction(value) ? undefined : "Expected action function",
          ),
        ),
      }),
    ),
    masks: Schema.optionalKey(Schema.Array(Text)),
    viewport: Schema.optionalKey(Viewport),
    video: Schema.optionalKey(Schema.Boolean),
  }),
)

export const selectScenarios = (
  scenarios: readonly Scenario[],
  selection: string | readonly string[],
): readonly Scenario[] => {
  Schema.decodeUnknownSync(Definitions)(scenarios)

  const byId = new Map(scenarios.map((scenario) => [scenario.id, scenario]))

  if (byId.size !== scenarios.length) throw new Error("Scenario ids must be unique")

  const ids = [
    ...new Set(
      (typeof selection === "string" ? selection.split(/\r?\n/u) : selection)
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ]

  if (ids.length === 0) throw new Error("Select at least one scenario")

  return ids.map((id) => {
    const scenario = byId.get(id)

    if (!scenario) throw new Error(`Unknown scenario: ${id}`)

    return scenario
  })
}

export const configure = (
  options: RunOptions,
  env: Readonly<Record<string, string | undefined>> = process.env,
) => {
  const directory = Schema.decodeUnknownSync(Text)(options.directory ?? env.NZILA_PROVE_DIR)
  const scenarios = selectScenarios(
    options.scenarios,
    options.scenarioIds ?? env.NZILA_PROVE_SCENARIOS ?? "",
  )

  const fixedTime = options.fixedTime ?? "2026-01-01T00:00:00.000Z"

  if (!Number.isFinite(Date.parse(fixedTime))) throw new Error("Invalid fixedTime")

  return {
    ...options,
    directory: resolve(directory),
    scenarios,
    fixedTime,
    headless: options.headless ?? true,
    viewport: Schema.decodeUnknownSync(Viewport)(options.viewport ?? { width: 1280, height: 800 }),
    locale: options.locale ?? "en-US",
    timezoneId: options.timezoneId ?? "UTC",
    deviceScaleFactor: Schema.decodeUnknownSync(Positive)(options.deviceScaleFactor ?? 1),
    colorScheme: options.colorScheme ?? "light",
    timeout: Schema.decodeUnknownSync(Positive)(options.timeout ?? 10_000),
  }
}

export type Configuration = ReturnType<typeof configure>
