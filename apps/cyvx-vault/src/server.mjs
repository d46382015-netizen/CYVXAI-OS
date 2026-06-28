import { createApp } from './app.mjs';

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 8789);
const app = createApp();

app.server.listen(port, host, () => {
  console.log(JSON.stringify({ level: 'info', time: new Date().toISOString(), event: 'server_started', host, port, url: `http://127.0.0.1:${port}` }));
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    console.log(JSON.stringify({ level: 'info', time: new Date().toISOString(), event: 'shutdown', signal }));
    await app.close();
    process.exit(0);
  });
}
