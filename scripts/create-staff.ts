import "dotenv/config";
import { STAFF_ROLES, type StaffRole } from "@/domain/permissions";

/**
 * Creates a staff account from the command line. Needed for the very first
 * developer account; after that, accounts are managed at /manage/staff. The
 * password is read from STAFF_PASSWORD so it never lands in shell history as
 * an argument.
 *
 *   STAFF_PASSWORD=... npm run staff:create -- you@example.com "Name" DEVELOPER
 */
async function main(): Promise<void> {
  const [email, name, role = "MANAGER"] = process.argv.slice(2);
  const password = process.env.STAFF_PASSWORD;
  if (!email || !name || !password || !STAFF_ROLES.includes(role as StaffRole)) {
    console.error("Usage: STAFF_PASSWORD=... npm run staff:create -- <email> <name> [MANAGER|DEVELOPER]");
    process.exit(1);
  }

  const { db } = await import("@/server/db/client");
  const { ConfigError } = await import("@/server/services/configuration");
  const { createStaff, MIN_PASSWORD_LENGTH } = await import("@/server/services/staff");
  try {
    await createStaff(db, { email, name, role: role as StaffRole, password }, "command-line");
    console.log(`Created ${role} account for ${email.toLowerCase()}.`);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    const reason =
      error.code === "DUPLICATE"
        ? `A staff account for ${email} already exists.`
        : `Check the email and name; the password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    console.error(reason);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
