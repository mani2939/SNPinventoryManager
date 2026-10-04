export class AuthConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function assertAuthConfiguration(env = process.env) {
  const hash = env.INVENTORY_PASSWORD_HASH || env.ADMIN_PASSWORD_HASH;
  if (!hash)
    throw new AuthConfigurationError(
      "AUTH_PASSWORD_HASH_MISSING",
      "Sign-in is not configured: set ADMIN_PASSWORD_HASH in Vercel Production and redeploy. Use npm run password:hash; do not enter the plain password in this variable.",
    );
  if (!/^[^\s:]{1,128}:[a-f0-9]{128}$/i.test(hash))
    throw new AuthConfigurationError(
      "AUTH_PASSWORD_HASH_INVALID",
      "ADMIN_PASSWORD_HASH has the wrong format. Generate it with npm run password:hash, copy only the salt:hash output into Vercel Production, and redeploy.",
    );
  const names = [env.INVENTORY_USERNAME || env.ADMIN_USERNAME || "SNPAdmin"];
  for (const prefix of ["INVOICING", "MASTER"]) {
    const username = env[prefix + "_USERNAME"],
      hash = env[prefix + "_PASSWORD_HASH"];
    if (!username && !hash) continue;
    if (!username || username.length > 100 || username.trim() !== username)
      throw new AuthConfigurationError(
        "AUTH_" + prefix + "_USERNAME_INVALID",
        "Set " +
          prefix +
          "_USERNAME to a nonempty username of up to 100 characters.",
      );
    if (!hash || !/^[^\s:]{1,128}:[a-f0-9]{128}$/i.test(hash))
      throw new AuthConfigurationError(
        "AUTH_" + prefix + "_PASSWORD_HASH_INVALID",
        "Set " + prefix + "_PASSWORD_HASH using npm run password:hash.",
      );
    if (names.includes(username))
      throw new AuthConfigurationError(
        "AUTH_USERNAME_CONFLICT",
        "Each workspace and master account must have a separate username.",
      );
    names.push(username);
  }
  if (!env.SESSION_SECRET)
    throw new AuthConfigurationError(
      "AUTH_SESSION_SECRET_MISSING",
      "Sign-in is not configured: set SESSION_SECRET in Vercel Production to at least 32 random characters and redeploy.",
    );
  if (env.SESSION_SECRET.length < 32)
    throw new AuthConfigurationError(
      "AUTH_SESSION_SECRET_INVALID",
      "SESSION_SECRET must contain at least 32 random characters. Update Vercel Production and redeploy.",
    );
}
