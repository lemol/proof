import type { ChildProcess } from "node:child_process"
import { constants } from "node:fs"
import { access, stat } from "node:fs/promises"
import { chromium, type Browser } from "playwright"

const systemPaths = (): string[] => {
  switch (process.platform) {
    case "darwin":
      return [
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      ]
    case "win32":
      return [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA]
        .filter((path): path is string => Boolean(path))
        .map((path) => `${path}/Google/Chrome/Application/chrome.exe`)
    default:
      return [
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/usr/bin/google-chrome",
        "/opt/google/chrome/chrome",
      ]
  }
}

const executable = async (path: string): Promise<boolean> => {
  try {
    await access(path, constants.X_OK)

    return (await stat(path)).isFile()
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "EACCES" || error.code === "ENOTDIR")
    ) {
      return false
    }

    throw error
  }
}

export const resolveExecutable = async (
  explicit?: string,
  system: readonly string[] = systemPaths(),
  bundled: string = chromium.executablePath(),
): Promise<string | undefined> => {
  if (explicit !== undefined) {
    if (!(await executable(explicit))) throw new Error(`Invalid browser executable: ${explicit}`)

    return explicit
  }

  for (const path of [...system, bundled]) {
    if (await executable(path)) return path
  }

  return undefined
}

// Playwright has no public handle for the browser's OS process. Capture the
// child it launched while still connected: its dispatcher is disposed when the
// CDP transport disconnects.
const launchedChild = (browser: Browser): ChildProcess | undefined => {
  const local = browser as Browser & {
    _connection?: {
      toImpl?: (browser: Browser) => {
        options?: { browserProcess?: { process?: ChildProcess } }
      }
    }
  }

  try {
    return local._connection?.toImpl?.(browser)?.options?.browserProcess?.process
  } catch {
    // Best effort across Playwright versions.
    return undefined
  }
}

export const browserExitProbe = (browser: Browser): (() => boolean) | undefined => {
  const child = launchedChild(browser)

  if (!child) return undefined

  return () => child.exitCode !== null || child.signalCode !== null
}

export const browserHandleDisposer = (browser: Browser): (() => void) => {
  // Restrict this fallback to a browser whose OS process has already exited.
  const child = launchedChild(browser)

  if (child) {
    try {
      const streams = [...child.stdio]

      return () => {
        for (const stream of streams) {
          try {
            stream?.destroy()
          } catch {
            // Still drop other streams and the process reference.
          }
        }

        try {
          child.unref()
        } catch {
          // Disposal must not change the already-confirmed release outcome.
        }
      }
    } catch {
      // Release is decided independently from this internal path.
    }
  }

  return () => {}
}

export const browserProcessId = async (browser: Browser): Promise<number> => {
  const session = await browser.newBrowserCDPSession()

  try {
    const { processInfo } = await session.send("SystemInfo.getProcessInfo")
    const pid = processInfo.find((info) => info.type === "browser")?.id

    if (pid === undefined) throw new Error("Browser process id is unavailable")

    return pid
  } finally {
    await session.detach()
  }
}

export const isMissingDisplay = (error: unknown): boolean =>
  error instanceof Error &&
  /Missing X server or \$DISPLAY|cannot open display|no DISPLAY environment variable/iu.test(
    error.message,
  )
