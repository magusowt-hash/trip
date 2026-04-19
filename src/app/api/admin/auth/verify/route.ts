import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ success: false });
    }

    const decoded = Buffer.from(token, 'base64').toString();
    const [key, timestamp] = decoded.split(':');

    if (!key || !timestamp) {
      return NextResponse.json({ success: false });
    }

    const age = Date.now() - parseInt(timestamp);
    if (age > 7 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ success: false });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false });
  }
}