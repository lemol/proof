const timestamp = (milliseconds: number): string => {
  const hours = Math.floor(milliseconds / 3_600_000)
  const minutes = Math.floor(milliseconds / 60_000) % 60
  const seconds = Math.floor(milliseconds / 1_000) % 60

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds % 1_000).padStart(3, "0")}`
}

export const writeChapters = (
  cues: readonly { readonly action: string; readonly end: number }[],
): string => {
  let previous = 0
  let result = "WEBVTT\n\n"

  for (const [index, cue] of cues.entries()) {
    const end = Math.max(previous + 1, Math.round(cue.end * 1000))
    const name = cue.action
      .replace(/&/gu, "&amp;")
      .replace(/</gu, "&lt;")
      .replace(/>/gu, "&gt;")
      .replace(/[\r\n]+/gu, " ")

    result += `${index + 1}\n${timestamp(previous)} --> ${timestamp(end)}\n${name}\n\n`
    previous = end
  }

  return result
}
