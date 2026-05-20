import type { NextRequest } from 'next/server';
import { handleStandardMapSearch } from '@/modules/maps/packages/standard-map/api';

export async function GET(req: NextRequest) {
  return handleStandardMapSearch(req);
}
