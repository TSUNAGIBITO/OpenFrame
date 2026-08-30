// The guard that lets TsunaguEditor push uploads/versions without a session.
//
// Every case here is a way the endpoint could end up open: a token short enough
// to guess, a comparison that accepts a prefix, or an absent env var read as an
// absent header and waved through. Mirrors admin-api-token.test.ts.

import { describe, expect, it, afterEach, vi } from 'vitest';
import {
  MIN_INTEGRATION_API_TOKEN_LENGTH,
  getIntegrationApiToken,
  isIntegrationTokenRequest,
} from '@/lib/integration-api-token';

// Written out rather than generated from the constant: a test whose input comes
// from the code under test stops testing the length rule the moment it changes.
const TOKEN = 'zq4Xr7Tn2Vb9Kd5Mw8Hs3Lp6Cf1Gj0Ye';
const SHORT = 'zq4Xr7Tn2Vb9Kd5Mw8Hs3Lp6Cf1Gj0Y';

function requestWith(headers: Record<string, string>): Request {
  return new Request('http://localhost:3000/api/integration/review-uploads', { headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getIntegrationApiToken', () => {
  it('is null when nothing is configured', () => {
    vi.stubEnv('OPENFRAME_INTEGRATION_TOKEN', '');
    expect(getIntegrationApiToken()).toBeNull();
  });

  it('is null for a token shorter than the minimum', () => {
    expect(SHORT).toHaveLength(MIN_INTEGRATION_API_TOKEN_LENGTH - 1);
    vi.stubEnv('OPENFRAME_INTEGRATION_TOKEN', SHORT);
    expect(getIntegrationApiToken()).toBeNull();
  });

  it('trims surrounding whitespace, which a pasted env value carries', () => {
    vi.stubEnv('OPENFRAME_INTEGRATION_TOKEN', `  ${TOKEN}\n`);
    expect(getIntegrationApiToken()).toBe(TOKEN);
  });
});

describe('isIntegrationTokenRequest', () => {
  it('refuses every request when no token is configured', () => {
    vi.stubEnv('OPENFRAME_INTEGRATION_TOKEN', '');
    expect(isIntegrationTokenRequest(requestWith({ authorization: `Bearer ${TOKEN}` }))).toBe(
      false
    );
    expect(isIntegrationTokenRequest(requestWith({}))).toBe(false);
  });

  it('refuses a matching header when the configured token is too short', () => {
    vi.stubEnv('OPENFRAME_INTEGRATION_TOKEN', SHORT);
    expect(isIntegrationTokenRequest(requestWith({ authorization: `Bearer ${SHORT}` }))).toBe(
      false
    );
  });

  it('accepts the configured token, whatever case the scheme is written in', () => {
    vi.stubEnv('OPENFRAME_INTEGRATION_TOKEN', TOKEN);
    expect(isIntegrationTokenRequest(requestWith({ authorization: `Bearer ${TOKEN}` }))).toBe(true);
    expect(isIntegrationTokenRequest(requestWith({ authorization: `bearer ${TOKEN}` }))).toBe(true);
  });

  it('refuses a prefix, a suffix and a different token of the same length', () => {
    vi.stubEnv('OPENFRAME_INTEGRATION_TOKEN', TOKEN);
    expect(isIntegrationTokenRequest(requestWith({ authorization: `Bearer ${SHORT}` }))).toBe(
      false
    );
    expect(isIntegrationTokenRequest(requestWith({ authorization: `Bearer ${TOKEN}x` }))).toBe(
      false
    );
    expect(
      isIntegrationTokenRequest(
        requestWith({ authorization: 'Bearer aq4Xr7Tn2Vb9Kd5Mw8Hs3Lp6Cf1Gj0Ye' })
      )
    ).toBe(false);
  });

  it('refuses a missing header, a bare token and another scheme', () => {
    vi.stubEnv('OPENFRAME_INTEGRATION_TOKEN', TOKEN);
    expect(isIntegrationTokenRequest(requestWith({}))).toBe(false);
    expect(isIntegrationTokenRequest(requestWith({ authorization: TOKEN }))).toBe(false);
    expect(isIntegrationTokenRequest(requestWith({ authorization: `Basic ${TOKEN}` }))).toBe(false);
  });
});
