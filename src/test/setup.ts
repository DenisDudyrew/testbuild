import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Полифилл для NextResponse в тестах
process.env.ENCRYPTION_KEY = 'test-encryption-key-for-testing-only';
process.env.AUTH_SECRET = 'test-auth-secret-for-testing-only';

// Мок для revalidatePath (Server Actions падают без него в jsdom)
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));
