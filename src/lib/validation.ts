import { z } from 'zod';

// Схемы валидации
export const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Логин должен быть минимум 3 символа')
    .max(30, 'Логин не может быть длиннее 30 символов')
    .regex(/^[a-zA-Z0-9_]+$/, 'Логин может содержать только латинские буквы, цифры и _'),
  password: z
    .string()
    .min(6, 'Пароль должен быть минимум 6 символов')
    .max(128, 'Пароль слишком длинный'),
  email: z
    .string()
    .email('Некорректный email'),
});

export const createPostSchema = z.object({
  content: z
    .string()
    .max(1000, 'Максимум 1000 символов')
    .optional()
    .default(''),
  mediaUrl: z.string().nullable().optional(),
  mediaType: z.enum(['image', 'video', 'circle']).nullable().optional(),
});

export const createCommentSchema = z.object({
  content: z
    .string()
    .min(1, 'Комментарий не может быть пустым')
    .max(1000, 'Максимум 1000 символов'),
  parentId: z.string().nullable().optional(),
});

export const updateProfileSchema = z.object({
  username: z
    .string()
    .min(3, 'Логин должен быть минимум 3 символа')
    .max(30, 'Логин не может быть длиннее 30 символов')
    .regex(/^[a-zA-Z0-9_]+$/, 'Логин может содержать только латинские буквы, цифры и _')
    .optional(),
  avatar: z.string().nullable().optional(),
  header: z.string().nullable().optional(),
  bio: z.string().max(500, 'Максимум 500 символов').nullable().optional(),
});

export const updateUserSchema = z.object({
  username: z
    .string()
    .min(3, 'Логин должен быть минимум 3 символа')
    .max(30, 'Логин не может быть длиннее 30 символов')
    .regex(/^[a-zA-Z0-9_]+$/, 'Логин может содержать только латинские буквы, цифры и _')
    .optional(),
  role: z.enum(['user', 'admin']).optional(),
});

export const releaseNoteSchema = z.object({
  title: z
    .string()
    .min(1, 'Заголовок обязателен')
    .max(200, 'Максимум 200 символов'),
  content: z
    .string()
    .min(1, 'Содержание обязательно'),
});

// Вспомогательная функция для валидации
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const firstError = result.error.issues[0];
    return { success: false, error: firstError?.message || 'Validation error' };
  }
  return { success: true, data: result.data };
}
