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
      if (user) {
        token.id = user.id;
        // Загружаем данные из БД только при первом входе
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { role: true, avatar: true },
        });
        if (dbUser) {
          token.role = dbUser.role;
          token.picture = dbUser.avatar ?? undefined;
        }
      } else if (trigger === 'update') {
        // При update используем существующие данные из токена без лишнего запроса к БД
        // Если нужны свежие данные — вызывается signOut/re-login
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
