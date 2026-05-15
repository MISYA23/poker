const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

function getFreePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

async function main() {
  const serverPort = await getFreePort();
  const clientPort = await getFreePort();

  console.log(`server → http://localhost:${serverPort}`);
  console.log(`client → http://localhost:${clientPort}  ← open this`);

  const server = spawn('npx', ['nodemon', 'index.js'], {
    cwd: path.join(__dirname, 'server'),
    env: { ...process.env, PORT: String(serverPort) },
    stdio: 'inherit',
  });

  const client = spawn('npx', ['vite', '--port', String(clientPort), '--strictPort'], {
    cwd: path.join(__dirname, 'client'),
    env: { ...process.env, SERVER_PORT: String(serverPort) },
    stdio: 'inherit',
  });

  const cleanup = () => { server.kill(); client.kill(); };
  process.on('SIGINT', () => { cleanup(); process.exit(); });
  process.on('SIGTERM', () => { cleanup(); process.exit(); });
  server.on('exit', () => { client.kill(); });
  client.on('exit', () => { server.kill(); });
}

main();
