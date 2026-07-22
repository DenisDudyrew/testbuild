import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Поддержка Prisma Accelerate: если DATABASE_URL содержит "accelerate",
// используем @prisma/extension-accelerate
// Для включения: замени DATABASE_URL на Accelerate connection string
// и раскомментируй импорт:
// import { withAccelerate } from "@prisma/extension-accelerate";

const prismaClient = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
});

// Подключение Accelerate:
// export const prisma = prismaClient.$extends(withAccelerate());

export const prisma = globalForPrisma.prisma ?? prismaClient;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
