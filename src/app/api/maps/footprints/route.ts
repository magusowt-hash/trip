import type { NextRequest } from 'next/server';
import {
  deleteStandardMapFootprint,
  getStandardMapFootprints,
  postStandardMapFootprint,
} from '@/modules/maps/packages/standard-map/api';

export async function GET(req: NextRequest) {
  return getStandardMapFootprints(req);
}

export async function POST(req: NextRequest) {
  return postStandardMapFootprint(req);
}

export async function DELETE(req: NextRequest) {
  return deleteStandardMapFootprint(req);
}
