import type { NextRequest } from 'next/server';
import {
  deleteStandardMapFavorite,
  getStandardMapFavorites,
  postStandardMapFavorite,
} from '@/modules/maps/packages/standard-map/api';

export async function GET(req: NextRequest) {
  return getStandardMapFavorites(req);
}

export async function POST(req: NextRequest) {
  return postStandardMapFavorite(req);
}

export async function DELETE(req: NextRequest) {
  return deleteStandardMapFavorite(req);
}
