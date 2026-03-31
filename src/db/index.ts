import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// 注意：本项目使用外部 Postgres。drizzle client 在服务端模块初始化时创建，
// 避免在每个请求内重复构建对象。
function parseWantsSsl(databaseUrl: string | undefined) {
  if (!databaseUrl) return false;
  try {
    const url = new URL(databaseUrl);
    const sslmode = url.searchParams.get('sslmode')?.toLowerCase();
    return (
      sslmode === 'require' ||
      sslmode === 'prefer' ||
      sslmode === 'allow' ||
      sslmode === 'verify-full'
    );
  } catch {
    return false;
  }
}

const databaseUrl = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: databaseUrl,
  // 如果连接串不需要 SSL（sslmode=disable），这里必须保持 undefined。
  ssl: parseWantsSsl(databaseUrl) ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });

