import { NextRequest } from 'next/server';
import {
  getChinaNatureAdminTopics,
  putChinaNatureAdminTopics,
} from '@/modules/maps/packages/china-nature-map/api';

export async function GET(request: NextRequest) {
  return getChinaNatureAdminTopics(request);
}

export async function PUT(request: NextRequest) {
  return putChinaNatureAdminTopics(request);
}
