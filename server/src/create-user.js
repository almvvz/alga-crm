// Create an account from the command line (handy locally):
//
//   PASSWORD='a-long-password' npm run create-user -- admin ali@example.com "Alikhan"
//   PASSWORD='a-long-password' npm run create-user -- tutor sara@example.com "Sara Tan"
//
// The person must choose a new password the first time they sign in.
import { pool, query } from "./db.js";
import { checkPasswordStrength, hashPassword } from "./auth.js";

const [role, email, ...nameParts] = process.argv.slice(2);
const fullName = nameParts.join(" ").trim();
const password = process.env.PASSWORD;

try {
  if (!["admin", "tutor"].includes(role) || !email || !fullName || !password) {
    throw new Error('Usage: PASSWORD="..." npm run create-user -- <admin|tutor> <email> "<Full Name>"');
  }
  checkPasswordStrength(password);
  await query(
    `INSERT INTO users (email, full_name, password_hash, role, must_change_password)
     VALUES ($1, $2, $3, $4, TRUE)`,
    [email.toLowerCase(), fullName, await hashPassword(password), role]
  );
  console.log(`Created ${role} ${email}`);
} catch (err) {
  console.error(err.code === "23505" ? "A user with that email already exists." : err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
