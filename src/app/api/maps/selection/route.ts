import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const AMAP_KEY = '64138cb3827187cd053ccbb9eaa18fa2';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lng = searchParams.get('lng');
  const lat = searchParams.get('lat');

  if (!lng || !lat) {
    return NextResponse.json({ error: '缺少经纬度' }, { status: 400 });
  }

  try {
    const url = new URL('https://restapi.amap.com/v3/geocode/regeo');
    url.searchParams.set('key', AMAP_KEY);
    url.searchParams.set('location', `${lng},${lat}`);
    url.searchParams.set('extensions', 'all');
    url.searchParams.set('radius', '150');
    url.searchParams.set('roadlevel', '0');

    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ error: '地图选点服务暂时不可用' }, { status: 502 });
    }

    const data = await res.json();
    const pois = Array.isArray(data.regeocode?.pois) ? data.regeocode.pois : [];
    const first = pois[0];

    if (!first?.name || !first?.location) {
      return NextResponse.json({ error: '当前位置未识别到明确地点' }, { status: 404 });
    }

    const [poiLng, poiLat] = String(first.location).split(',');
    return NextResponse.json({
      poi: {
        amapPoiId: first.id || null,
        name: first.name || '',
        lng: poiLng || lng,
        lat: poiLat || lat,
        address: first.address || data.regeocode?.formatted_address || '',
        city: data.regeocode?.addressComponent?.city || data.regeocode?.addressComponent?.province || '',
        district: data.regeocode?.addressComponent?.district || '',
        type: first.type || '',
      },
    });
  } catch (error) {
    console.error('GET /api/maps/selection error:', error);
    return NextResponse.json({ error: '选点失败' }, { status: 500 });
  }
}
