import { Schema } from "effect"

const Text = Schema.String.check(Schema.isPattern(/\S/u))
const ArtifactPath = Text.check(
  Schema.makeFilter((path) =>
    !/[\\:]/u.test(path) &&
    !Array.from(path).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
    path.split("/").every((part) => part !== "" && part !== "." && part !== "..")
      ? undefined
      : "Expected a relative POSIX artifact path without traversal",
  ),
)

const Offset = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))
const Step = Schema.Struct({
  action: Text,
  outcome: Schema.Literals(["passed", "failed"]),
  expected: Schema.optionalKey(Text),
  error: Schema.optionalKey(Text),
  screenshot: ArtifactPath,
  at: Offset,
}).check(
  Schema.makeFilter((step) =>
    (step.outcome === "failed") === (step.error !== undefined)
      ? undefined
      : "A failed step requires error; a passed step must omit it",
  ),
)

const Scenario = Schema.Struct({
  id: Text,
  outcome: Schema.Literals(["passed", "failed"]),
  steps: Schema.NonEmptyArray(Step),
  video: Schema.optionalKey(ArtifactPath),
  chapters: Schema.optionalKey(ArtifactPath),
  trace: Schema.optionalKey(ArtifactPath),
}).check(
  Schema.makeFilter((scenario) => {
    if ((scenario.video === undefined) !== (scenario.chapters === undefined)) {
      return "Video and chapters must both be present or both be absent"
    }

    let previous = 0

    for (const [index, step] of scenario.steps.entries()) {
      if (step.at < previous) return "Step offsets must be nondecreasing"

      if (step.outcome === "failed" && index !== scenario.steps.length - 1) {
        return "A scenario stops at its first failed step"
      }

      previous = step.at
    }

    return scenario.outcome === scenario.steps.at(-1)!.outcome
      ? undefined
      : "Scenario outcome must match its steps"
  }),
)

export const ManifestSchema = Schema.Struct({
  version: Schema.Literal(1),
  scenarios: Schema.NonEmptyArray(Scenario),
}).check(
  Schema.makeFilter((manifest) =>
    new Set(manifest.scenarios.map((scenario) => scenario.id)).size === manifest.scenarios.length
      ? undefined
      : "Scenario ids must be unique",
  ),
)

export type Manifest = typeof ManifestSchema.Type
export type ScenarioProof = Manifest["scenarios"][number]
export type StepProof = ScenarioProof["steps"][number]

export const decodeManifest = Schema.decodeUnknownSync(ManifestSchema)
