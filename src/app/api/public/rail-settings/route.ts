import { getRailMapPublicSettings } from '@/modules/maps/packages/rail-map/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  return getRailMapPublicSettings();
}
