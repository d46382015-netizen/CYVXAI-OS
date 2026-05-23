import http from "node:http";
import { readFileSync } from "node:fs";

function html() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>EOS Viz</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; background: #0b1020; color: #e6edf3; }
      header { padding: 16px 20px; background: #111833; border-bottom: 1px solid #223; }
      main { padding: 20px; }
      pre { background: #0f172a; padding: 16px; border-radius: 8px; overflow: auto; }
    </style>
  </head>
  <body>
    <header><strong>EOS Viz</strong></header>
    <main>
      <p>Timeline, causal graph, replay scrubber hooks land here.</p>
      <pre id="trace">Loading...</pre>
    </main>
    <script>
      fetch('/trace').then(r => r.json()).then(data => {
        document.getElementById('trace').textContent = JSON.stringify(data, null, 2);
      }).catch(err => {
        document.getElementById('trace').textContent = String(err);
      });
    </script>
  </body>
</html>`;
}

export function startVizServer({ port = 8787, traceFile = null } = {}) {
  const server = http.createServer((req, res) => {
    if (req.url === "/trace") {
      res.writeHead(200, { "content-type": "application/json" });
      try {
        const data = traceFile ? JSON.parse(readFileSync(traceFile, "utf8")) : { events: [] };
        res.end(JSON.stringify(data));
      } catch (error) {
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html());
  });

  server.listen(port);
  return server;
}
