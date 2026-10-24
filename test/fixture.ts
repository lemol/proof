import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

export const temporary = async () => {
  const directory = await mkdtemp(join(tmpdir(), "proof-test-"))

  return { directory, close: () => rm(directory, { recursive: true, force: true }) }
}

export const fixture = () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(
        `<!doctype html><html><head><style>
      * { box-sizing: border-box } body { margin: 0; font: 20px sans-serif; background: white }
      #panel { width: 100%; height: 200px; background: rgb(200, 20, 20) }
      #dynamic { width: 300px; height: 40px }
      </style></head><body><div id="panel"></div><button id="change">Change</button>
      <output id="date"></output><div id="dynamic"></div><script>
      document.querySelector('#date').textContent = new Date().toISOString();
      document.querySelector('#dynamic').textContent = String(Math.random());
      document.querySelector('#change').onclick = () => {
        document.querySelector('#panel').style.background = 'rgb(20, 200, 20)';
        document.querySelector('#panel').textContent = 'Changed';
      };
      </script></body></html>`,
        { headers: { "content-type": "text/html" } },
      ),
  })

  return {
    baseURL: server.url.href,
    close: async () => {
      await server.stop(true)
    },
  }
}
