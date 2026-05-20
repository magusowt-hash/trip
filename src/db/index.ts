import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema';

function parseDatabaseUrl(url: string) {
  const match = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (!match) {
    throw new Error('Invalid DATABASE_URL format');
  }
  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: parseInt(match[4], 10),
    database: match[5],
  };
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const config = parseDatabaseUrl(databaseUrl);

type DbPool = ReturnType<typeof mysql.createPool>;

declare global {
  // eslint-disable-next-line no-var
  var __tripMysqlPool: DbPool | undefined;
}

const pool =
  globalThis.__tripMysqlPool ??
  mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60000,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  });

if (!globalThis.__tripMysqlPool) {
  globalThis.__tripMysqlPool = pool;
}

export const db = drizzle(pool, { schema, mode: 'default' });
