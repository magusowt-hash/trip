import type { NextRequest } from 'next/server';
import { handleStandardMapSelection } from '@/modules/maps';

export async function GET(req: NextRequest) {
  return handleStandardMapSelection(req);
}
