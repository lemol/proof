import { describe, expect, test } from "bun:test"
import failed from "../../examples/manifests/v1/failed.json"
import noVideo from "../../examples/manifests/v1/no-video.json"
import passed from "../../examples/manifests/v1/passed.json"
import { decodeManifest } from "./index"

describe("manifest v1", () => {
  test("the README examples decode as the published contract fixtures", async () => {
    const readme = await Bun.file(new URL("../../README.md", import.meta.url)).text()
    const examples = [...readme.matchAll(/```json\n([\s\S]*?)\n```/gu)].map((match) =>
      decodeManifest(JSON.parse(match[1]!)),
    )

    expect(examples).toEqual<unknown>([passed, failed, noVideo])
  })

  test.each([passed, failed, noVideo])("decodes public examples", (value) => {
    expect(decodeManifest(value)).toEqual<unknown>(value)
  })

  test("rejects unknown versions and empty proofs", () => {
    expect(() => decodeManifest({ ...passed, version: 2 })).toThrow()
    expect(() => decodeManifest({ version: 1, scenarios: [] })).toThrow()
  })

  test.each([
    "../escape.webp",
    "/absolute.webp",
    "C:/file.webp",
    "a\\b.webp",
    "a//b.webp",
    "./a.webp",
    "a/../b.webp",
    "a/",
    "",
    "a\u0000b",
  ])("rejects unsafe artifact path %s", (path) => {
    const value = structuredClone(noVideo)

    value.scenarios[0]!.steps[0]!.screenshot = path
    expect(() => decodeManifest(value)).toThrow()
  })

  test("requires unique scenarios, nonempty steps and action names", () => {
    expect(() =>
      decodeManifest({ ...passed, scenarios: [...passed.scenarios, ...passed.scenarios] }),
    ).toThrow()
    expect(() =>
      decodeManifest({ version: 1, scenarios: [{ id: "a", outcome: "passed", steps: [] }] }),
    ).toThrow()
    const value = structuredClone(noVideo)

    value.scenarios[0]!.steps[0]!.action = " "
    expect(() => decodeManifest(value)).toThrow()
  })

  test.each([-1, NaN, Infinity])("rejects invalid offsets", (at) => {
    const value = structuredClone(noVideo)

    value.scenarios[0]!.steps[0]!.at = at
    expect(() => decodeManifest(value)).toThrow()
  })

  test("rejects decreasing offsets", () => {
    const value = structuredClone(passed)

    value.scenarios[0]!.steps[1]!.at = 0.1
    expect(() => decodeManifest(value)).toThrow()
  })

  test("requires matching scenario outcome and failure diagnostics", () => {
    const scenario = failed.scenarios[0]!

    expect(() =>
      decodeManifest({ version: 1, scenarios: [{ ...scenario, outcome: "passed" }] }),
    ).toThrow()
    expect(() =>
      decodeManifest({
        version: 1,
        scenarios: [{ ...scenario, steps: [{ ...scenario.steps[0], error: undefined }] }],
      }),
    ).toThrow()
    expect(() =>
      decodeManifest({
        version: 1,
        scenarios: [{ ...scenario, steps: [...scenario.steps, ...scenario.steps] }],
      }),
    ).toThrow()
    const value = structuredClone(noVideo)

    expect(() =>
      decodeManifest({
        version: 1,
        scenarios: [
          {
            ...value.scenarios[0],
            steps: [{ ...value.scenarios[0]!.steps[0], error: "unexpected" }],
          },
        ],
      }),
    ).toThrow()
  })

  test("requires video and chapters together", () => {
    expect(() =>
      decodeManifest({ version: 1, scenarios: [{ ...noVideo.scenarios[0], video: "video.webm" }] }),
    ).toThrow()
    expect(() =>
      decodeManifest({
        version: 1,
        scenarios: [{ ...noVideo.scenarios[0], chapters: "chapters.vtt" }],
      }),
    ).toThrow()
  })

  test("ignores additive unknown fields", () => {
    expect(decodeManifest({ ...noVideo, future: true })).toEqual<unknown>(noVideo)
  })
})
