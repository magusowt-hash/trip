import type { NextRequest } from 'next/server';
import { handleStandardMapSearch } from '@/modules/maps';

export async function GET(req: NextRequest) {
  return handleStandardMapSearch(req);
}
