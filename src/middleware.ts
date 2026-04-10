import { NextResponse, type NextRequest } from 'next/server';
import { getAuthTokenFromRequest } from '@/server/auth/cookies';
import { verifyAuthToken } from '@/server/auth/jwt';

/**
 * 未登录访问受保护页面：重定向到 /login
 *
 * 受保护范围：除了 /login、/register 以及所有 /api/*、/_next/* 静态资源之外，其它页面默认都需要登录。
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 本地先跑前端时，可能只部署了后端/数据库，前端未配置 AUTH_JWT_SECRET。
  // 使用默认值而非跳过保护
  const jwtSecret = process.env.AUTH_JWT_SECRET;
  if (!jwtSecret) {
    return redirectToLogin(req);
  }

  // 公开：登录/注册页 & 所有 API（包含 /api/auth/*） & Next 内部资源 & 常见静态文件
  if (
    pathname === '/login' ||
    pathname === '/register' ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  ) {
    return NextResponse.next();
  }

  const token = getAuthTokenFromRequest(req);
  if (!token) {
    return redirectToLogin(req);
  }

  try {
    await verifyAuthToken(token);
    return NextResponse.next();
  } catch {
    return redirectToLogin(req);
  }
}

function redirectToLogin(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('from', req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // matcher 的负向排除避免 middleware 影响静态资源与公开页面
  matcher: ['/((?!_next/|api/|favicon.ico|robots.txt|sitemap.xml).*)'],
};