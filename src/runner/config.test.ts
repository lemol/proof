import { expect, test } from "bun:test"
import { selectScenarios, configure } from "./config"

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

test("explicit options override environment without mutating it", () => {
  const env = { NZILA_PROVE_DIR: "/ambient", NZILA_PROVE_SCENARIOS: "missing" }
  const config = configure({ launch, scenarios, directory: "/explicit", scenarioIds: ["a"] }, env)

  expect(config.directory).toBe("/explicit")
  expect(config.scenarios.map((scenario) => scenario.id)).toEqual(["a"])
  expect(env.NZILA_PROVE_DIR).toBe("/ambient")
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
