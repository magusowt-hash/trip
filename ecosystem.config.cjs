module.exports = {
  apps: [
    {
      name: 'backend',
      script: './trip-backend/dist/main.js',
      cwd: '/root/trip',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        HOST: '0.0.0.0',
        DATABASE_URL: 'mysql://magus:3W.xh.com@127.0.0.1:3306/trip',
        AUTH_JWT_SECRET: '3W.xh.com',
        CORS_ORIGIN: 'http://121.5.24.138:3001,http://127.0.0.1:3000,http://127.0.0.1:3001,http://localhost:3000,http://localhost:3001,http://localhost:3002',
        AUTH_COOKIE_SECURE: 'false',
      },
    },
    {
      name: 'frontend',
      script: './node_modules/.bin/next',
      args: 'start -p 3001 -H 0.0.0.0',
      cwd: '/root/trip',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        HOSTNAME: '0.0.0.0',
      },
    },
  ],
};