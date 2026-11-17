import "dotenv/config";

const env = process.env;

export const config = {
  env: env.NODE_ENV ?? "development",
  isProd: env.NODE_ENV === "production",
  isTest: env.NODE_ENV === "test",
  port: Number(env.PORT ?? 4000),

  // Local dev falls back to the "alga" database on your own machine.
  databaseUrl: env.DATABASE_URL || null,

  sessionDays: Number(env.SESSION_DAYS ?? 7),

  // Only used to create the very first admin when the users table is empty.
  adminEmail: env.ADMIN_EMAIL || null,
  adminPassword: env.ADMIN_PASSWORD || null,
  adminName: env.ADMIN_NAME || "Admin",

  // The built React app. In production the server serves it too.
  clientDist: env.CLIENT_DIST || null,

  timezone: "Asia/Kuala_Lumpur",
};
