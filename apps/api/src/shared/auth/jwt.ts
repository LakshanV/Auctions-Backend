import { SignJWT, jwtVerify } from 'jose';
import { type Role, isRole } from '@singha/contracts';
import { type AssuranceLevel } from './principal';

const ALG = 'HS256';

export interface PrincipalClaims {
  customerId: string | null;
  roles: Role[];
  /** Assurance level carried by the token (pack FIX-08). Defaults to aal1. */
  aal?: AssuranceLevel;
}

const encode = (secret: string): Uint8Array => new TextEncoder().encode(secret);

export async function signPrincipal(
  claims: PrincipalClaims,
  secret: string,
  ttl = '2h',
): Promise<string> {
  return new SignJWT({ roles: claims.roles, aal: claims.aal ?? 'aal1' })
    .setProtectedHeader({ alg: ALG })
    .setSubject(claims.customerId ?? '')
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(encode(secret));
}

export async function verifyPrincipalToken(
  token: string,
  secret: string,
): Promise<Required<PrincipalClaims>> {
  const { payload } = await jwtVerify(token, encode(secret));
  const rawRoles = Array.isArray(payload.roles) ? payload.roles : [];
  const roles = rawRoles.filter((r): r is Role => typeof r === 'string' && isRole(r));
  const customerId = typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
  const aal: AssuranceLevel = payload.aal === 'aal2' ? 'aal2' : 'aal1';
  return { customerId, roles, aal };
}
