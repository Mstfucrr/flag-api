import { registerAs } from '@nestjs/config';

/**
 * Optional shared API key for runtime (`FlagsSdkController`) and admin
 * (`FlagsAdminController`) HTTP routes. When empty, requests are not
 * authenticated (local/dev parity with previous behavior). When set, callers
 * must send `Authorization: Bearer <FLAGS_API_KEY>`.
 */
export default registerAs('flags', () => ({
  apiKey: (process.env.FLAGS_API_KEY ?? '').trim(),
}));
