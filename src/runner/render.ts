import type { Page } from "playwright"

// An isolated realm uses Chromium's native animation frame scheduler even
// when a scenario pauses or replaces the application's clock functions.
export const renderFrame = async (page: Page, timeout: number): Promise<void> => {
  const session = await page.context().newCDPSession(page)
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    await Promise.race([
      (async () => {
        const { frameTree } = await session.send("Page.getFrameTree")
        const { executionContextId } = await session.send("Page.createIsolatedWorld", {
          frameId: frameTree.frame.id,
          worldName: "proof-renderer",
        })

        const result = await session.send("Runtime.evaluate", {
          contextId: executionContextId,
          expression:
            "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
          awaitPromise: true,
        })

        if (result.exceptionDetails) throw new Error("Renderer frame wait failed")
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Renderer frame wait timed out")), timeout)
      }),
    ])
  } finally {
    clearTimeout(timer)
    await session.detach()
  }
}
