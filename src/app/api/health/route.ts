import { NextResponse } from 'next/server';

/**
 * 负载均衡 / 容器编排 / 运维探活用
 * 不依赖外部服务，返回 200 + JSON
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'trip-web',
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
