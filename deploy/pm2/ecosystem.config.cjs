module.exports = {
  apps: [
    {
      name: 'trip-web',
      cwd: '/Users/apple/Desktop/Trival',
      script: 'npm',
      args: 'run start:bind:nginx',
      env: {
        NODE_ENV: 'production',
        # 若使用 Nginx 统一域名：/ 反代 Next、/api 反代 Nest
        NEXT_PUBLIC_API_BASE_URL: '/api',
      },
    },
    {
      name: 'trip-backend',
      cwd: '/Users/apple/Desktop/Trival/trip-backend',
      script: 'npm',
      args: 'run start:prod',
      env: {
        NODE_ENV: 'production',
        # TODO: 按你的环境配置 DATABASE_URL / AUTH_JWT_SECRET 等
      },
    },
  ],
};

