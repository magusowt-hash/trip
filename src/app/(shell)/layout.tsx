import type { ReactNode } from 'react';
import { ShellLayout } from '@/components/layout/ShellLayout';

export default function ShellGroupLayout({ children }: { children: ReactNode }) {
  return <ShellLayout>{children}</ShellLayout>;
}
