import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const AMAP_KEY = 'fbf5d9a8e346f93257eb7c5ab4d32034';

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
  const q = req.nextUrl.searchParams.get('q')?.trim();
  const city = req.nextUrl.searchParams.get('city')?.trim();

  if (!q) {
    return NextResponse.json({ error: '缺少搜索关键词' }, { status: 400 });
  }

  try {
    const params = new URLSearchParams();
    params.set('key', AMAP_KEY);
    params.set('keywords', q);
    params.set('page_size', '15');
    if (city) params.set('region', city);
    const amapUrl = `https://restapi.amap.com/v5/place/text?${params.toString()}`;

    const res = await fetch(amapUrl, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ error: '地图搜索服务暂时不可用' }, { status: 502 });
    }

    const data = await res.json();
    if (data.status === '0' || (data.infocode && data.infocode !== '10000')) {
      console.error('Amap search api error:', data.info || data.infocode);
      return NextResponse.json({ error: `高德搜索失败：${data.info || data.infocode || '未知错误'}` }, { status: 502 });
    }
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
