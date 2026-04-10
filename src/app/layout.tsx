import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { AppProviders } from './providers';
import { headers } from 'next/headers';
import './globals.css';

function normalizeSiteUrl(raw: string) {
  const v = raw?.trim() || 'http://localhost:3000';
  if (!/^https?:\/\//i.test(v)) return `https://${v}`;
  return v;
}

const siteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: process.env.NEXT_PUBLIC_APP_NAME || 'Trip Web',
    template: `%s | ${process.env.NEXT_PUBLIC_APP_NAME || 'Trip Web'}`,
  },
  description: '旅行平台前端：模块化架构与设计系统，支持公网部署与运营。',
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    siteName: process.env.NEXT_PUBLIC_APP_NAME || 'Trip Web',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const pathname = headersList.get('x-current-path') || '';
  const hideActions = pathname === '/login' || pathname === '/register';
  
  return (
    <html lang="zh-CN">
      <body>
        <AppProviders>
          <Header hideActionsValue={hideActions} />
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
