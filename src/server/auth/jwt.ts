import jwt from 'jsonwebtoken';

export type AuthJwtPayload = {
  sub: string; // user id
  phone: string;
};

const AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET;
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function ensureSecret(): string {
  if (!AUTH_JWT_SECRET) {
    throw new Error('Missing AUTH_JWT_SECRET');
  }
  return AUTH_JWT_SECRET;
}

export function signAuthToken(payload: AuthJwtPayload): string {
  return jwt.sign(payload, ensureSecret(), {
    algorithm: 'HS256',
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

export function verifyAuthToken(token: string): AuthJwtPayload {
  const decoded = jwt.verify(token, ensureSecret(), {
    algorithms: ['HS256'],
  });

  if (typeof decoded === 'string' || !decoded) {
    throw new Error('Invalid auth token');
  }

  const record = decoded as Record<string, unknown>;
  const sub = record.sub;
  const phone = record.phone;

  if (typeof sub !== 'string' || typeof phone !== 'string') {
    throw new Error('Invalid auth token payload');
  }

  return { sub, phone };
}

