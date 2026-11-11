import crypto from 'crypto';

/**
 * Constant-time string comparison to prevent timing attacks.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const strA = a.trim();
  const strB = b.trim();
  if (strA === strB) return true;
  const bufA = Buffer.from(strA, 'utf-8');
  const bufB = Buffer.from(strB, 'utf-8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Computes Tally HMAC-SHA256 signature over raw request payload.
 */
export function computeTallyHmac(rawPayload: string | Buffer, secret: string, encoding: 'base64' | 'hex' = 'base64'): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawPayload);
  return hmac.digest(encoding);
}

/**
 * Verifies official Tally webhook HMAC-SHA256 signature.
 * Tally header format: 'tally-signature' (or 'x-tally-signature')
 * Supports base64 HMAC signatures, 't=<timestamp>,v1=<signature>' format,
 * as well as secret query parameter '?secret=<secret>' and custom headers.
 */
export function verifyTallyWebhookSignature(
  rawBody: string | Buffer,
  headers: Record<string, string | string[] | undefined>,
  queryParamsOrUrl: any,
  configuredSecret: string
): { verified: boolean; reason?: string } {
  if (!configuredSecret || !configuredSecret.trim()) {
    return { verified: true }; // Pass-through if no secret configured server-side
  }

  const cleanSecret = configuredSecret.trim();

  // 1. Extract candidate secret from query parameters, query object, or URL string
  let providedSecretCandidate: string | undefined = undefined;

  if (queryParamsOrUrl) {
    if (typeof queryParamsOrUrl === 'object' && queryParamsOrUrl.secret) {
      providedSecretCandidate = String(queryParamsOrUrl.secret);
    } else if (typeof queryParamsOrUrl === 'string') {
      const match = queryParamsOrUrl.match(/[?&]secret=([^&]+)/);
      if (match) providedSecretCandidate = match[1];
    }
  }

  if (providedSecretCandidate && timingSafeCompare(providedSecretCandidate.trim(), cleanSecret)) {
    return { verified: true };
  }

  // 2. Extract secret from Custom Secret Headers (X-Webhook-Secret / X-Tally-Secret / Authorization Bearer)
  const customHeader =
    headers['x-webhook-secret'] ||
    headers['x-tally-secret'] ||
    headers['x-google-forms-secret'];

  if (typeof customHeader === 'string' && customHeader.trim()) {
    if (timingSafeCompare(customHeader.trim(), cleanSecret)) {
      return { verified: true };
    }
  }

  const authHeader = headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.trim()) {
    const parts = authHeader.trim().split(' ');
    const token = parts.length === 2 ? parts[1] : authHeader.trim();
    if (timingSafeCompare(token, cleanSecret)) {
      return { verified: true };
    }
  }

  // 3. Official Tally Signature Header Check ('tally-signature' or 'x-tally-signature')
  const sigHeader = headers['tally-signature'] || headers['x-tally-signature'];
  if (!sigHeader || (typeof sigHeader !== 'string' && !Array.isArray(sigHeader))) {
    return {
      verified: false,
      reason: 'Missing webhook signature header (tally-signature).'
    };
  }

  const sigString = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
  const rawBodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');

  // Compute expected HMAC digests
  const expectedBase64 = computeTallyHmac(rawBodyStr, cleanSecret, 'base64');
  const expectedHex = computeTallyHmac(rawBodyStr, cleanSecret, 'hex');

  // Check if header contains t=...,v1=... format
  if (sigString.includes('v1=')) {
    const parts = sigString.split(',');
    let v1Sig = '';
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.startsWith('v1=')) {
        v1Sig = trimmed.substring(3).trim();
        break;
      }
    }
    if (v1Sig && (timingSafeCompare(v1Sig, expectedBase64) || timingSafeCompare(v1Sig, expectedHex))) {
      return { verified: true };
    }
  }

  // Check direct signature string matching (base64 or hex)
  if (timingSafeCompare(sigString.trim(), expectedBase64) || timingSafeCompare(sigString.trim(), expectedHex)) {
    return { verified: true };
  }

  return {
    verified: false,
    reason: 'Signature verification failed: Invalid Tally webhook HMAC signature.'
  };
}
