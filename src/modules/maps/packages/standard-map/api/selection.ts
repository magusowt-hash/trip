import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const AMAP_KEY = 'fbf5d9a8e346f93257eb7c5ab4d32034';

export async function handleStandardMapSelection(req: NextRequest) {
  const lng = req.nextUrl.searchParams.get('lng');
  const lat = req.nextUrl.searchParams.get('lat');

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
    if (data.status !== '1') {
      console.error('Amap regeo api error:', data.info, data.infocode);
      return NextResponse.json({ error: `高德逆地理失败：${data.info || '未知错误'}` }, { status: 502 });
    }
    const pois = Array.isArray(data.regeocode?.pois) ? data.regeocode.pois : [];
    const first = pois[0];

    if (!first?.name || !first?.location) {
      return NextResponse.json({ error: '当前位置未识别到明确地点' }, { status: 404 });
    }

    const [poiLng, poiLat] = String(first.location).split(',');
    const ac = data.regeocode?.addressComponent || {};
    const city = (typeof ac.city === 'string' && ac.city) || ac.province || ac.district || '';

    return NextResponse.json({
      poi: {
        amapPoiId: first.id || null,
        name: first.name || '',
        lng: poiLng || lng,
        lat: poiLat || lat,
        address: first.address || data.regeocode?.formatted_address || '',
        city,
        district: ac.district || '',
        type: first.type || '',
      },
    });
  } catch (error) {
    console.error('GET /api/maps/selection error:', error);
    return NextResponse.json({ error: '选点失败' }, { status: 500 });
  }
}

