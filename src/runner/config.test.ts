import { expect, test } from "bun:test"
import { configure, launchOptions, selectScenarios } from "./config"

const actions = [{ name: "open", run: async () => {} }]
const scenarios = [
  { id: "a", actions },
  { id: "b", actions },
]

const launch = async () => ({ baseURL: "http://localhost:3000", close: async () => {} })

test("selects newline ids in requested order, omitting blanks and duplicates", () => {
  expect(selectScenarios(scenarios, "b\n\na\nb\n").map((scenario) => scenario.id)).toEqual([
    "b",
    "a",
  ])
})

test("rejects empty or unknown selection and duplicate definitions", () => {
  expect(() => selectScenarios(scenarios, "\n")).toThrow()
  expect(() => selectScenarios(scenarios, ["a", "missing"])).toThrow("missing")
  expect(() => selectScenarios([...scenarios, scenarios[0]!], "a")).toThrow()
})

test("validates action definitions before launch", () => {
  expect(() => selectScenarios([{ id: "a", actions: [] }], "a")).toThrow()
  expect(() =>
    selectScenarios([{ id: "a", actions: [{ name: " ", run: async () => {} }] }], "a"),
  ).toThrow()
})

test("reads the directory and selection from PROOF_DIR and PROOF_SCENARIOS", () => {
  const config = configure(
    { launch, scenarios },
    { PROOF_DIR: "/ambient", PROOF_SCENARIOS: "b\na" },
  )

  expect(config.directory).toBe("/ambient")
  expect(config.scenarios.map((scenario) => scenario.id)).toEqual(["b", "a"])
})

test("explicit options override environment without mutating it", () => {
  const env = { PROOF_DIR: "/ambient", PROOF_SCENARIOS: "missing" }
  const config = configure({ launch, scenarios, directory: "/explicit", scenarioIds: ["a"] }, env)

  expect(config.directory).toBe("/explicit")
  expect(config.scenarios.map((scenario) => scenario.id)).toEqual(["a"])
  expect(env.PROOF_DIR).toBe("/ambient")
})

test("rejects malformed dates and viewports", () => {
  const options = { launch, scenarios, directory: "/out", scenarioIds: ["a"] }

  expect(() => configure({ ...options, fixedTime: "bad" }, {})).toThrow()
  expect(() => configure({ ...options, viewport: { width: 0, height: 800 } }, {})).toThrow()
  expect(() =>
    configure(
      { ...options, scenarios: [{ id: "a", actions, viewport: { width: 400, height: -1 } }] },
      {},
    ),
  ).toThrow()
})

test("passes the given Chromium switches to the launch, and none by default", () => {
  const options = { launch, scenarios, directory: "/out", scenarioIds: ["a"] }
  const args = ["--disable-gpu-rasterization", "--force-color-profile=srgb"]

  expect(launchOptions(configure(options, {}), "/chromium")).toEqual({
    executablePath: "/chromium",
    headless: true,
    timeout: 10_000,
    args: [],
  })
  expect(launchOptions(configure({ ...options, args }, {}), "/chromium").args).toEqual(args)
})

test("rejects a blank Chromium switch", () => {
  const options = { launch, scenarios, directory: "/out", scenarioIds: ["a"] }

  expect(() => configure({ ...options, args: ["--headless", " "] }, {})).toThrow()
})
