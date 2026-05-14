/**
 * prisma/seed.js
 *
 * Idempotent admin user bootstrap.
 * Run: npx prisma db seed
 *
 * Env vars required:
 *   ADMIN_USERNAME — username for the admin account
 *   ADMIN_PASSWORD — initial password (should be changed after first login)
 */

"use strict";

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD must be set to seed the database.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { username },
    create: { username, passwordHash, role: "admin", isActive: true },
    update: { passwordHash, role: "admin", isActive: true },
  });

  console.log(`✅ Admin user "${user.username}" seeded (id: ${user.id}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
