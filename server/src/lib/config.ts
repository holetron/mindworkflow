/**
 * Centralized application configuration.
 *
 * Reads required values from environment variables and fails fast on first
 * access if any critical variable is missing.
 *
 * The config object uses lazy initialization so that `loadEnv()` has a chance
 * to populate `process.env` before validation runs.  All consumers should
 * import `config` from this module instead of reading `process.env` directly
 * for JWT-related settings.
 */

export interface AppConfig {
  /** Secret used to sign and verify JSON Web Tokens. */
  readonly jwtSecret: string;

  /** Current runtime environment (e.g. "production", "development"). */
  readonly nodeEnv: string;

  /** Whether the application is running in production mode. */
  readonly isProduction: boolean;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `[config] Missing required environment variable: ${name}. ` +
        `Set it in your .env file or export it before starting the server.`,
    );
  }
  return value.trim();
}

let _cached: AppConfig | null = null;

function resolve(): AppConfig {
  if (_cached) {
    return _cached;
  }

  const jwtSecret = requireEnv('JWT_SECRET');
  const nodeEnv = (process.env.NODE_ENV ?? 'development').trim();

  _cached = Object.freeze({
    jwtSecret,
    nodeEnv,
    isProduction: nodeEnv === 'production',
  });

  return _cached;
}

/**
 * Application configuration singleton (lazy).
 *
 * The first property access triggers env-var validation.  If a required
 * variable is missing the process crashes with a descriptive error.
 *
 * @example
 * ```ts
 * import { config } from '../lib/config';
 * jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
 * ```
 */
export const config: AppConfig = new Proxy({} as AppConfig, {
  get(_target, prop: string) {
    const resolved = resolve();
    return resolved[prop as keyof AppConfig];
  },
});
