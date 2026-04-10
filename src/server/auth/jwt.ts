import { SignJWT, jwtVerify } from 'jose';

export type AuthJwtPayload = {
  sub: string; // user id
  phone: string;
};

/** 与 trip-backend JwtModule（expiresIn: '7d', HS256）一致 */
const TOKEN_TTL = '7d' as const;

function getSecretKey(): Uint8Array {
  const s = process.env.AUTH_JWT_SECRET;
  if (!s) {
    throw new Error('Missing AUTH_JWT_SECRET');
  }
  return new TextEncoder().encode(s);
}

export async function signAuthToken(payload: AuthJwtPayload): Promise<string> {
  return await new SignJWT({ phone: payload.phone })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(getSecretKey());
}

export async function verifyAuthToken(token: string): Promise<AuthJwtPayload> {
  const { payload } = await jwtVerify(token, getSecretKey(), {
    algorithms: ['HS256'],
  });

  const subRaw = payload.sub;
  const phoneRaw = payload.phone;

  const sub =
    typeof subRaw === 'string' ? subRaw : subRaw != null ? String(subRaw) : '';
  const phone = typeof phoneRaw === 'string' ? phoneRaw : '';

  if (!sub || !phone) {
    throw new Error('Invalid auth token payload');
  }

  return { sub, phone };
}
