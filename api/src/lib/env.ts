function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: required("JWT_SECRET"),
  nodeEnv: process.env.NODE_ENV ?? "development",
  /** Set COOKIE_SECURE=true when serving over HTTPS. */
  cookieSecure: process.env.COOKIE_SECURE === "true",
};
