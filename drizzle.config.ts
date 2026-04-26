import type { Config } from 'drizzle-kit';

function parseDatabaseUrl(url: string) {
  const match = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (!match) throw new Error('Invalid DATABASE_URL format');
  return { user: match[1], password: match[2], host: match[3], port: parseInt(match[4]), database: match[5] };
}

const dbUrl = process.env.DATABASE_URL!;
const creds = parseDatabaseUrl(dbUrl);

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'mysql',
  dbCredentials: {
    host: creds.host,
    port: creds.port,
    user: creds.user,
    password: creds.password,
    database: creds.database,
  },
} satisfies Config;
