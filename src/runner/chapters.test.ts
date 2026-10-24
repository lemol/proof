import { expect, test } from "bun:test"
import { writeChapters } from "./chapters"

test("chapter boundaries end at the post-action screenshots", () => {
  expect(
    writeChapters([
      { action: "open", at: 1.25 },
      { action: "select", at: 2.5 },
    ]),
  ).toBe(
    "WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.250\nopen\n\n2\n00:00:01.250 --> 00:00:02.500\nselect\n\n",
  )
})

test("escapes cue markup and line breaks", () => {
  expect(writeChapters([{ action: "<open> &\nnext --> end", at: 0.1 }])).toContain(
    "&lt;open&gt; &amp; next --&gt; end",
  )
})

test("fast actions retain positive ordered cues", () => {
  const text = writeChapters([
    { action: "a", at: 0 },
    { action: "b", at: 0 },
  ])

  expect(text).toContain("00:00:00.000 --> 00:00:00.001")
  expect(text).toContain("00:00:00.001 --> 00:00:00.002")
})
