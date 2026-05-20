import { NextRequest } from 'next/server';
import {
  getRailMapAdminSettings,
  putRailMapAdminSettings,
} from '@/modules/maps/packages/rail-map/api';

export async function GET(request: NextRequest) {
  return getRailMapAdminSettings(request);
}

export async function PUT(request: NextRequest) {
  return putRailMapAdminSettings(request);
}
