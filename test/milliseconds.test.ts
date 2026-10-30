import { expect, test } from "bun:test"
import { milliseconds } from "./milliseconds"

// A step's `at` and a chapter end are whole milliseconds written as seconds;
// their float sum can land a hair above the exact value.
test("a chapter ending exactly `hold` after `at` keeps its promise", () => {
  const at = 1.006
  const hold = 1000
  const end = 2.006

  expect(end).toBeLessThan(at + hold / 1000)
  expect(milliseconds(end)).toBeGreaterThanOrEqual(milliseconds(at) + hold)
})

test("one millisecond short still fails", () => {
  expect(milliseconds(2.005)).toBeLessThan(milliseconds(1.006) + 1000)
})
