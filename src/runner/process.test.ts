import { expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { alive, kill } from "./process"

test("a live process group is seen, killed, then gone", async () => {
  const child = spawn("sleep", ["30"], { detached: true, stdio: "ignore" })
  const exited = new Promise((resolve) => child.once("exit", resolve))

  try {
    expect(alive(child.pid!)).toBe(true)
    kill(child.pid!)
    expect(await exited).toBeNull()
    expect(alive(child.pid!)).toBe(false)
    expect(() => kill(child.pid!)).not.toThrow()
  } finally {
    child.kill("SIGKILL")
  }
})
