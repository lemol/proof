const hasCode = (error: unknown, code: string): boolean =>
  error instanceof Error && "code" in error && error.code === code

export const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)

    return true
  } catch (error) {
    if (hasCode(error, "ESRCH")) return false

    if (hasCode(error, "EPERM")) return true

    throw error
  }
}

export const kill = (pid: number): void => {
  if (process.platform !== "win32") {
    try {
      // Playwright launches Chromium as a detached process-group leader.
      process.kill(-pid, "SIGKILL")

      return
    } catch (error) {
      if (!hasCode(error, "ESRCH")) throw error
    }
  }

  try {
    process.kill(pid, "SIGKILL")
  } catch (error) {
    if (!hasCode(error, "ESRCH")) throw error
  }
}
