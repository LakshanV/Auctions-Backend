import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Verifies a Supabase Auth access token (pack doc 09 "external IdP subject maps
 * to Singha Customer/User"). The project signs sessions with asymmetric keys
 * (ES256), so we verify against the public JWKS — no shared secret is needed and
 * none is ever held by the API. The remote key set is cached by `jose` and
 * refreshed on key rotation.
 */
export interface SupabaseClaims {
  sub: string;
  email: string | null;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedUrl = '';

function jwksFor(supabaseUrl: string): ReturnType<typeof createRemoteJWKSet> {
  const base = supabaseUrl.replace(/\/+$/, '');
  const url = `${base}/auth/v1/.well-known/jwks.json`;
  if (!jwks || cachedUrl !== url) {
    jwks = createRemoteJWKSet(new URL(url));
    cachedUrl = url;
  }
  return jwks;
}

export async function verifySupabaseToken(
  token: string,
  supabaseUrl: string,
): Promise<SupabaseClaims> {
  if (!supabaseUrl) throw new Error('Supabase URL not configured');
  const base = supabaseUrl.replace(/\/+$/, '');
  const { payload } = await jwtVerify(token, jwksFor(supabaseUrl), {
    issuer: `${base}/auth/v1`,
    audience: 'authenticated',
  });
  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  if (!sub) throw new Error('Supabase token has no subject');
  const email = typeof payload.email === 'string' ? payload.email : null;
  return { sub, email };
}
