/**
 * PM2 守护 Next 生产进程（非 Docker 时在云服务器上使用）
 * 前置：npm run build
 * 启动：pm2 start deploy/pm2/ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: 'trip-web',
      cwd: require('path').resolve(__dirname, '../..'),
      script: 'npm',
      args: 'run start:bind',
      instances: 1,
      exec_mode: 'fork',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
