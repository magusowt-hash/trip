/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 云服务器 / Docker 部署：生成 standalone 产物，镜像体积小、启动快
  output: 'standalone',
  // 隐藏 X-Powered-By，降低指纹暴露
  poweredByHeader: false,
  // 生产环境安全响应头（HTTPS 站点可在 Nginx 再补 Strict-Transport-Security）
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:3002/api/:path*',
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
