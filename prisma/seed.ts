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

  if (!existing) {
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
  } else {
    console.log("Admin user already exists.");
  }

  // Создаем тестовых пользователей для мессенджера
  const testUsers = [
    { username: 'testuser1', email: 'test1@zephyr.local', bio: 'Тестовый пользователь 1' },
    { username: 'testuser2', email: 'test2@zephyr.local', bio: 'Тестовый пользователь 2' },
  ];

  for (const user of testUsers) {
    const existingUser = await prisma.user.findUnique({ where: { username: user.username } });
    if (!existingUser) {
      await prisma.user.create({
        data: {
          username: user.username,
          emailHash: hashEmail(user.email),
          emailEncrypted: encrypt(user.email),
          emailVerified: true,
          password: await bcrypt.hash('password', 10),
          bio: user.bio,
        },
      });
      console.log(`Test user created: ${user.username}`);
    }
  }

  // Создаем тестовый диалог между admin и testuser1
  const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
  const testUser1 = await prisma.user.findUnique({ where: { username: 'testuser1' } });

  if (admin && testUser1) {
    const existingConv = await prisma.conversation.findFirst({
      where: {
        type: 'direct',
        AND: [
          { participants: { some: { userId: admin.id } } },
          { participants: { some: { userId: testUser1.id } } },
        ],
      },
    });

    if (!existingConv) {
      await prisma.conversation.create({
        data: {
          type: 'direct',
          participants: {
            create: [
              { userId: admin.id },
              { userId: testUser1.id },
            ],
          },
        },
      });
      console.log('Test conversation created between admin and testuser1');
    }
  }
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
