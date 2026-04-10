export function parseWantsSsl(databaseUrl: string | undefined): boolean {
  if (!databaseUrl) return false;
  try {
    const url = new URL(databaseUrl);
    // 通用：允许通过 `sslmode=`（Postgres 习惯）或 `ssl=true`（MySQL 连接习惯）打开
    const sslmode = url.searchParams.get('sslmode')?.toLowerCase();
    const ssl = url.searchParams.get('ssl')?.toLowerCase();
    return (
      sslmode === 'require' ||
      sslmode === 'prefer' ||
      sslmode === 'allow' ||
      sslmode === 'verify-full' ||
      ssl === 'true' ||
      ssl === '1'
    );
  } catch {
    return false;
  }
}
