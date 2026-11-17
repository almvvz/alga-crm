import { config } from "./config.js";
import { query } from "./db.js";
import { checkPasswordStrength, hashPassword } from "./auth.js";

// A brand-new database has no users, so nobody could ever sign in. If
// ADMIN_EMAIL and ADMIN_PASSWORD are set, create the first admin from them.
// That admin must pick a new password at first sign-in, so after that the
// env var can be deleted from your hosting dashboard.
export async function ensureAdmin() {
  const { rows } = await query("SELECT COUNT(*) AS n FROM users");
  if (rows[0].n > 0) return;

  if (!config.adminEmail || !config.adminPassword) {
    console.warn("No users exist yet. Set ADMIN_EMAIL and ADMIN_PASSWORD, then restart, to create the first admin.");
    return;
  }

  checkPasswordStrength(config.adminPassword);
  await query(
    `INSERT INTO users (email, full_name, password_hash, role, must_change_password)
     VALUES ($1, $2, $3, 'admin', TRUE)`,
    [config.adminEmail.toLowerCase(), config.adminName, await hashPassword(config.adminPassword)]
  );
  console.log(`Created the first admin account: ${config.adminEmail}`);
}
