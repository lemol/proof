import { expect, test } from "bun:test"
import { writeChapters } from "./chapters"

test("each chapter starts where the previous one ends", () => {
  expect(
    writeChapters([
      { action: "open", end: 1.25 },
      { action: "select", end: 2.5 },
    ]),
  ).toBe(
    "WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.250\nopen\n\n2\n00:00:01.250 --> 00:00:02.500\nselect\n\n",
  )
})

test("escapes cue markup and line breaks", () => {
  expect(writeChapters([{ action: "<open> &\nnext --> end", end: 0.1 }])).toContain(
    "&lt;open&gt; &amp; next --&gt; end",
  )
})

test("fast actions retain positive ordered cues", () => {
  const text = writeChapters([
    { action: "a", end: 0 },
    { action: "b", end: 0 },
  ])

  expect(text).toContain("00:00:00.000 --> 00:00:00.001")
  expect(text).toContain("00:00:00.001 --> 00:00:00.002")
})
