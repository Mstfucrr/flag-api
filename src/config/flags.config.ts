import { registerAs } from '@nestjs/config';

/**
 * Required shared API key for runtime (`FlagsSdkController`) and admin
 * (`FlagsAdminController`) HTTP routes. Callers must send
 * `Authorization: Bearer <FLAGS_API_KEY>`. Bootstrap refuses to start the
 * process when this is unset — see `main.ts`.
 */
export default registerAs('flags', () => ({
  apiKey: (process.env.FLAGS_API_KEY ?? '').trim(),
}));
