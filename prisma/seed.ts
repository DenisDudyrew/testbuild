import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { encrypt, hashEmail } from "../src/lib/encryption";

const prisma = new PrismaClient();

async function main() {
  const adminUsername = "admin";
  const adminPassword = "password";

  const existing = await prisma.user.findUnique({
    where: { username: adminUsername },
  });

  if (existing) {
    if (existing.role !== 'admin') {
      await prisma.user.update({
        where: { username: adminUsername },
        data: { role: 'admin' },
      });
      console.log("Admin user updated with admin role.");
    } else {
      console.log("Admin user already exists, skipping seed.");
    }
    return;
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  await prisma.user.create({
    data: {
      username: adminUsername,
      emailHash: hashEmail('admin@zephyr.local'),
      emailEncrypted: encrypt('admin@zephyr.local'),
      emailVerified: true,
      password: hashedPassword,
      role: 'admin',
      bio: 'Администратор ZEPHYR',
    },
  });

  console.log(`Admin user created: ${adminUsername} / ${adminPassword}`);
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
