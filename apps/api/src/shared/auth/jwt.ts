import { SignJWT, jwtVerify } from 'jose';
import { type Role, isRole } from '@singha/contracts';

const ALG = 'HS256';

export interface PrincipalClaims {
  customerId: string | null;
  roles: Role[];
}

const encode = (secret: string): Uint8Array => new TextEncoder().encode(secret);

export async function signPrincipal(
  claims: PrincipalClaims,
  secret: string,
  ttl = '2h',
): Promise<string> {
  return new SignJWT({ roles: claims.roles })
    .setProtectedHeader({ alg: ALG })
    .setSubject(claims.customerId ?? '')
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(encode(secret));
}

export async function verifyPrincipalToken(
  token: string,
  secret: string,
): Promise<PrincipalClaims> {
  const { payload } = await jwtVerify(token, encode(secret));
  const rawRoles = Array.isArray(payload.roles) ? payload.roles : [];
  const roles = rawRoles.filter((r): r is Role => typeof r === 'string' && isRole(r));
  const customerId = typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
  return { customerId, roles };
}
