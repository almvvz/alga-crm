import pg from "pg";
import { config } from "./config.js";

const { Pool, types } = pg;

// COUNT() and SUM() come back as BIGINT, which pg returns as a string. Our
// numbers are small, so turn them into real numbers.
types.setTypeParser(20, (v) => Number(v));
// DATE columns: keep "2026-11-18" as text instead of a JS Date, which would
// shift the day when the server and browser are in different timezones.
types.setTypeParser(1082, (v) => v);

function poolConfig() {
  if (!config.databaseUrl) {
    // Local development: the "alga" database, as your own OS user.
    return { database: process.env.PGDATABASE ?? "alga" };
  }
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(config.databaseUrl);
  return {
    connectionString: config.databaseUrl,
    // Hosted databases (Neon etc.) require an encrypted connection.
    ssl: config.isProd && !isLocal ? { rejectUnauthorized: true } : undefined,
  };
}

export const pool = new Pool({
  ...poolConfig(),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000, // a sleeping free-tier database can take a few seconds to wake
});

// Hosted databases close idle connections. Without this handler, that would
// crash the whole server with an unhandled 'error' event.
pool.on("error", (err) => console.error("Idle database connection error:", err.message));

export const query = (text, params) => pool.query(text, params);

// Run several statements as one all-or-nothing unit.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
