export class AuthConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function assertAuthConfiguration(env = process.env) {
  const hash = env.ADMIN_PASSWORD_HASH;
  if (!hash) throw new AuthConfigurationError(
    "AUTH_PASSWORD_HASH_MISSING",
    "Sign-in is not configured: set ADMIN_PASSWORD_HASH in Vercel Production and redeploy. Use npm run password:hash; do not enter the plain password in this variable.",
  );
  if (!/^[^\s:]{1,128}:[a-f0-9]{128}$/i.test(hash)) throw new AuthConfigurationError(
    "AUTH_PASSWORD_HASH_INVALID",
    "ADMIN_PASSWORD_HASH has the wrong format. Generate it with npm run password:hash, copy only the salt:hash output into Vercel Production, and redeploy.",
  );
  if (!env.SESSION_SECRET) throw new AuthConfigurationError(
    "AUTH_SESSION_SECRET_MISSING",
    "Sign-in is not configured: set SESSION_SECRET in Vercel Production to at least 32 random characters and redeploy.",
  );
  if (env.SESSION_SECRET.length < 32) throw new AuthConfigurationError(
    "AUTH_SESSION_SECRET_INVALID",
    "SESSION_SECRET must contain at least 32 random characters. Update Vercel Production and redeploy.",
  );
}
