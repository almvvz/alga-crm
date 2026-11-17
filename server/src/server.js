import { config } from "./config.js";
import { pool } from "./db.js";
import { runMigrations } from "./migrate.js";
import { ensureAdmin } from "./bootstrap.js";
import { createApp } from "./index.js";

process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));

// Bring the database up to date, make sure someone can sign in, then listen.
await runMigrations();
await ensureAdmin();

const server = createApp().listen(config.port, () => {
  console.log(`Alga CRM listening on port ${config.port} (${config.env})`);
});

// Hosts send SIGTERM on every deploy: finish current requests, then exit.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
