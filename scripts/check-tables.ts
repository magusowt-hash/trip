import mysql from 'mysql2/promise';

async function main() {
  const pool = mysql.createPool({
    host: '127.0.0.1',
    port: 3306,
    user: 'magus',
    password: '3W.xh.com',
    database: 'trip'
  });
  
  const [users] = await pool.execute('DESCRIBE users');
  console.log('users 表结构:', users);
  
  await pool.end();
}

main();