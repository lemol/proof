import { expect, test } from "bun:test"
import { combineErrors, diagnostic } from "./errors"

test("action rejections are normalized without assuming an Error", () => {
  expect(diagnostic("missing")).toBe("missing")
  expect(diagnostic(undefined)).toBe("undefined")
  expect(diagnostic(Symbol("missing"))).toBe("Symbol(missing)")
  expect(
    diagnostic({
      toString() {
        throw new Error("cannot stringify")
      },
    }),
  ).toContain("unprintable")
  expect(diagnostic(" ").trim().length).toBeGreaterThan(0)
})

test("cleanup cannot erase the primary infrastructure failure", () => {
  const primary = new Error("capture failed")
  const cleanup = new Error("cleanup failed")

  try {
    combineErrors({ error: primary }, [cleanup])
    throw new Error("Expected combined failure")
  } catch (error) {
    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors).toEqual([primary, cleanup])
  }
})
