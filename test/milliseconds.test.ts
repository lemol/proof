import { expect, test } from "bun:test"
import { milliseconds } from "./milliseconds"

// A step's `at` and a chapter end are whole milliseconds written as seconds;
// their float sum can land a hair above the exact value.
test("a chapter ending exactly `hold` after `at` keeps its promise", () => {
  const at = 2.01
  const hold = 1000
  const end = 3.01

  expect(end).toBeLessThan(at + hold / 1000)
  expect(milliseconds(end)).toBeGreaterThanOrEqual(milliseconds(at) + hold)
})

test("one millisecond short still fails", () => {
  expect(milliseconds(3.009)).toBeLessThan(milliseconds(2.01) + 1000)
})
