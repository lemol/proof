import { expect, test } from "bun:test"
import { releaseBrowser, type ProcessControl } from "./release"

const never = () => new Promise<void>(() => {})
const fake = (state: { alive: boolean; killable: boolean; kills: number[] }): ProcessControl => ({
  alive: () => state.alive,
  kill: (pid) => {
    state.kills.push(pid)

    if (state.killable) state.alive = false
  },
})

test("a close that resolves within the bound leaves the process alone", async () => {
  const state = { alive: true, killable: true, kills: [] as number[] }

  expect(await releaseBrowser(async () => {}, 4242, 200, fake(state))).toBe("closed")
  expect(state.kills).toEqual([])
})

test("a close that rejects within the bound is a cleanup failure", async () => {
  const state = { alive: true, killable: true, kills: [] as number[] }

  await expect(
    releaseBrowser(
      async () => {
        throw new Error("pipe broke")
      },
      4242,
      200,
      fake(state),
    ),
  ).rejects.toThrow("pipe broke")
  expect(state.kills).toEqual([])
})

test("a hung close of an exited browser is released at the bound", async () => {
  const state = { alive: false, killable: true, kills: [] as number[] }
  const started = performance.now()

  expect(await releaseBrowser(never, 4242, 200, fake(state))).toBe("exited")
  expect(performance.now() - started).toBeGreaterThanOrEqual(190)
  expect(performance.now() - started).toBeLessThan(1000)
  expect(state.kills).toEqual([])
})

test("a hung close of a live browser kills it and releases once it exits", async () => {
  const state = { alive: true, killable: true, kills: [] as number[] }

  expect(await releaseBrowser(never, 4242, 200, fake(state))).toBe("killed")
  expect(state.kills).toEqual([4242])
})

test("a browser that survives the kill fails after a second bound", async () => {
  const state = { alive: true, killable: false, kills: [] as number[] }
  const started = performance.now()

  await expect(releaseBrowser(never, 4242, 200, fake(state))).rejects.toThrow(
    "Browser process 4242 is still running 200 ms after SIGKILL",
  )
  expect(performance.now() - started).toBeGreaterThanOrEqual(390)
  expect(performance.now() - started).toBeLessThan(1500)
})

test("a refused kill is a cleanup failure", async () => {
  const refused: ProcessControl = {
    alive: () => true,
    kill: () => {
      throw Object.assign(new Error("kill EPERM"), { code: "EPERM" })
    },
  }

  await expect(releaseBrowser(never, 4242, 200, refused)).rejects.toThrow("EPERM")
})

test("a hung close with no known process fails at the bound", async () => {
  const state = { alive: true, killable: true, kills: [] as number[] }

  await expect(releaseBrowser(never, undefined, 200, fake(state))).rejects.toThrow(
    "did not finish within 200 ms",
  )
})

test("a child that reported its exit is released even when its pid probes alive", async () => {
  const state = { alive: true, killable: true, kills: [] as number[] }
  const recycled: ProcessControl = { ...fake(state), exited: () => true }

  expect(await releaseBrowser(never, 4242, 200, recycled)).toBe("exited")
  expect(state.kills).toEqual([])
})

test("a child that exits after the kill releases despite a recycled pid", async () => {
  const state = { alive: true, killable: false, kills: [] as number[] }
  let exited = false
  const control: ProcessControl = {
    alive: () => state.alive,
    kill: (pid) => {
      state.kills.push(pid)
      exited = true
    },
    exited: () => exited,
  }

  expect(await releaseBrowser(never, 4242, 200, control)).toBe("killed")
  expect(state.kills).toEqual([4242])
})

test("a child that has not exited is killed through the pid", async () => {
  const state = { alive: true, killable: true, kills: [] as number[] }

  expect(await releaseBrowser(never, 4242, 200, { ...fake(state), exited: () => false })).toBe(
    "killed",
  )
  expect(state.kills).toEqual([4242])
})
