import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: { label: "Логин" },
        password: { label: "Пароль", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!username || !password) return null;

        const user = await prisma.user.findUnique({
          where: { username },
        });

        if (!user) return null;

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return null;

        return { id: user.id, name: user.username };
      },
    }),
  ],
  pages: {
    signIn: "/",
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      const id = (token as Record<string, unknown>).id as string;
      if (trigger === 'update' && id) {
        const dbUser = await prisma.user.findUnique({
          where: { id },
          select: { role: true, avatar: true },
        });
        if (dbUser) {
          token.role = dbUser.role;
          token.picture = dbUser.avatar ?? undefined;
        }
      }
      if (user) {
        token.id = user.id;
        // Получаем данные пользователя из БД
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { role: true, avatar: true },
        });
        if (dbUser) {
          token.role = dbUser.role;
          token.picture = dbUser.avatar ?? undefined;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        const user = session.user as unknown as { id: string; role: string; image: string };
        user.id = token.id as string;
        user.role = token.role as string;
        // Используем стандартное поле image для аватара
        user.image = token.picture as string;
      }
      return session;
    },
  },
});
