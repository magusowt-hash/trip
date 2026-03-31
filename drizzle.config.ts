import type { Config } from 'drizzle-kit';

function parseDatabaseUrl(databaseUrl: string | undefined) {
  if (!databaseUrl) {
    // 仅用于编译期/类型检查兜底；真正生成/迁移时必须提供有效 DATABASE_URL
    return {
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: 'postgres',
      database: 'trip',
      ssl: undefined,
    };
  }

  const url = new URL(databaseUrl);
  const database = url.pathname.replace(/^\//, '');

  const sslmode = url.searchParams.get('sslmode')?.toLowerCase();
  // 常见：sslmode=disable / require / prefer
  const wantsSsl =
    sslmode === 'require' || sslmode === 'prefer' || sslmode === 'allow' || sslmode === 'verify-full';

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user: url.username,
    password: url.password || undefined,
    database,
    // drizzle-kit 的 pg 连接选项允许传 ssl 或 ssl 对象
    // 如果你的连接串不需要 SSL（sslmode=disable），这里必须保持 undefined。
    ssl: wantsSsl ? { rejectUnauthorized: false } : undefined,
  };
}

export default {
  // drizzle-kit 会读取这里的 schema 定义来生成迁移文件
  schema: './src/db/schema.ts',
  // 输出到项目根目录下的 drizzle/（便于提交迁移文件）
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    ...parseDatabaseUrl(process.env.DATABASE_URL),
  },
} satisfies Config;

