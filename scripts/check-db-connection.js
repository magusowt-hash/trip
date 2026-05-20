const net = require('net');
const mysql = require('mysql2/promise');

function parseDatabaseUrl(url) {
  const match = url.match(/^mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/);
  if (!match) {
    throw new Error('Invalid DATABASE_URL format, expected mysql://user:password@host:port/database');
  }

  return {
    user: decodeURIComponent(match[1]),
    password: decodeURIComponent(match[2]),
    host: match[3],
    port: Number.parseInt(match[4], 10),
    database: match[5],
  };
}

function maskDatabaseUrl(url) {
  return url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
}

function checkTcpPort(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ ok: true }));
    socket.once('timeout', () => finish({ ok: false, reason: `timeout after ${timeoutMs}ms` }));
    socket.once('error', (error) => finish({ ok: false, reason: error.message }));
    socket.connect(port, host);
  });
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  console.log('=== Trip DB Connection Check ===');

  if (!databaseUrl) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
  }

  console.log(`DATABASE_URL: ${maskDatabaseUrl(databaseUrl)}`);

  let config;
  try {
    config = parseDatabaseUrl(databaseUrl);
  } catch (error) {
    console.error(`Parse failed: ${error.message}`);
    process.exit(1);
  }

  console.log(`Target: ${config.host}:${config.port}/${config.database}`);

  const tcpResult = await checkTcpPort(config.host, config.port);
  if (!tcpResult.ok) {
    console.error(`TCP connect failed: ${tcpResult.reason}`);
    console.error('Conclusion: MySQL is not listening on the target host/port, or the port is blocked.');
    process.exit(2);
  }

  console.log('TCP connect: OK');

  let connection;
  try {
    connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      connectTimeout: 5000,
    });
  } catch (error) {
    console.error(`MySQL login failed: ${error.message}`);
    console.error('Conclusion: Port is reachable, but MySQL auth/database selection failed.');
    process.exit(3);
  }

  console.log('MySQL login: OK');

  try {
    const [pingRows] = await connection.query('SELECT 1 AS ok');
    console.log(`SELECT 1: OK (${JSON.stringify(pingRows[0])})`);

    const [dbRows] = await connection.query('SELECT DATABASE() AS currentDatabase');
    console.log(`Current database: ${dbRows[0].currentDatabase || 'NULL'}`);

    const [statusRows] = await connection.query("SHOW STATUS LIKE 'Threads_connected'");
    if (Array.isArray(statusRows) && statusRows[0]) {
      console.log(`Threads_connected: ${statusRows[0].Value}`);
    }

    const [varsRows] = await connection.query("SHOW VARIABLES LIKE 'max_connections'");
    if (Array.isArray(varsRows) && varsRows[0]) {
      console.log(`max_connections: ${varsRows[0].Value}`);
    }

    console.log('Conclusion: Database is reachable and queryable from the current runtime.');
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`Unexpected error: ${error.message}`);
  process.exit(10);
});
