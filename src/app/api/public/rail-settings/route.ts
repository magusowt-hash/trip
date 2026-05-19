import { getRailMapPublicSettings } from '@/modules/maps';

export const dynamic = 'force-dynamic';

export async function GET() {
  return getRailMapPublicSettings();
}
