import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { STAFF_ROLES, type StaffRole } from "@/domain/permissions";

const MIN_PASSWORD_LENGTH = 12;

/**
 * Creates a staff account. There is no sign-up page, so this is the only way
 * in. The password is read from STAFF_PASSWORD so it never lands in shell
 * history as an argument.
 *
 *   STAFF_PASSWORD=... npm run staff:create -- manager@example.com "Name" MANAGER
 */
async function main(): Promise<void> {
  const [emailArgument, name, role = "MANAGER"] = process.argv.slice(2);
  const password = process.env.STAFF_PASSWORD;
  if (!emailArgument || !name || !password || !STAFF_ROLES.includes(role as StaffRole)) {
    console.error("Usage: STAFF_PASSWORD=... npm run staff:create -- <email> <name> [MANAGER|DEVELOPER]");
    process.exit(1);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(1);
  }

  const { db } = await import("@/server/db/client");
  const schema = await import("@/server/db/schema");
  const email = emailArgument.toLowerCase();

  const existing = await db.select().from(schema.staffUser).where(eq(schema.staffUser.email, email));
  if (existing.length > 0) {
    console.error(`A staff account for ${email} already exists.`);
    process.exit(1);
  }

  const userId = randomUUID();
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    await tx.insert(schema.staffUser).values({ id: userId, name, email, emailVerified: true, role: role as StaffRole });
    await tx.insert(schema.staffAccount).values({
      id: randomUUID(),
      userId,
      accountId: userId,
      providerId: "credential",
      password: passwordHash,
    });
  });
  console.log(`Created ${role} account for ${email}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
