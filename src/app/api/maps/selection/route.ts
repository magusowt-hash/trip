import type { NextRequest } from 'next/server';
import { handleStandardMapSelection } from '@/modules/maps/packages/standard-map/api';

export async function GET(req: NextRequest) {
  return handleStandardMapSelection(req);
}
