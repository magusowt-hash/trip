import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const AMAP_KEY = '64138cb3827187cd053ccbb9eaa18fa2';

type AmapPoi = {
  id?: string;
  name?: string;
  location?: string;
  address?: string;
  pname?: string;
  cityname?: string;
  adname?: string;
  type?: string;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();
  const city = searchParams.get('city')?.trim();

  if (!q) {
    return NextResponse.json({ error: '缺少搜索关键词' }, { status: 400 });
  }

  try {
    const url = new URL('https://restapi.amap.com/v5/place/text');
    url.searchParams.set('key', AMAP_KEY);
    url.searchParams.set('keywords', q);
    url.searchParams.set('page_size', '15');
    url.searchParams.set('show_fields', 'business,children,photos');
    if (city) url.searchParams.set('region', city);

    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ error: '地图搜索服务暂时不可用' }, { status: 502 });
    }

    const data = await res.json();
    const pois = Array.isArray(data.pois) ? data.pois : [];

    return NextResponse.json({
      results: pois
        .filter((poi: AmapPoi) => poi.name && poi.location)
        .map((poi: AmapPoi) => {
          const [lng, lat] = (poi.location || '').split(',');
          return {
            amapPoiId: poi.id || null,
            name: poi.name || '',
            lng: lng || '',
            lat: lat || '',
            address: poi.address || '',
            city: poi.cityname || poi.pname || '',
            district: poi.adname || '',
            type: poi.type || '',
          };
        }),
    });
  } catch (error) {
    console.error('GET /api/maps/search error:', error);
    return NextResponse.json({ error: '搜索失败' }, { status: 500 });
  }
}
