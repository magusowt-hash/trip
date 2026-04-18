'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/layout/Header';

export function ConditionalHeader() {
  const pathname = usePathname();
  
  if (pathname.startsWith('/management')) {
    return null;
  }
  
  return <Header />;
}