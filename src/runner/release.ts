import { alive, kill } from "./process"

export interface ProcessControl {
  readonly alive: (pid: number) => boolean
  readonly kill: (pid: number) => void
  /** Whether the launched child has reported its exit; absent when no handle was captured. */
  readonly exited?: (() => boolean) | undefined
}

export type Release = "closed" | "exited" | "killed"

export const releaseBrowser = async (
  close: () => Promise<void>,
  pid: number | undefined,
  bound: number,
  control: ProcessControl = { alive, kill },
): Promise<Release> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<"deadline">((resolve) => {
    timer = setTimeout(() => resolve("deadline"), bound)
  })

  try {
    // Promise.race observes late rejections as well as the initial settlement.
    const result = await Promise.race([
      Promise.resolve()
        .then(close)
        .then(() => "closed" as const),
      deadline,
    ])

    if (result === "closed") return result
  } finally {
    clearTimeout(timer)
  }

  // The child's own exit report outranks the pid, which the OS may have recycled.
  if (control.exited?.()) return "exited"

  if (pid === undefined) {
    throw new Error(`Browser close did not finish within ${bound} ms and its process is unknown`)
  }

  if (!control.alive(pid)) return "exited"

  control.kill(pid)

  const end = performance.now() + bound

  while (!control.exited?.() && control.alive(pid)) {
    const remaining = end - performance.now()

    if (remaining <= 0) {
      throw new Error(`Browser process ${pid} is still running ${bound} ms after SIGKILL`)
    }

    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(50, remaining)))
  }

  return "killed"
}
