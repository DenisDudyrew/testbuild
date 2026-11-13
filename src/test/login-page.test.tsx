import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/auth-client', () => ({ useSession: () => ({ data: null, update: vi.fn() }), signIn: vi.fn().mockResolvedValue({ error: 'Доступ запрещён', status: 403 }) }));
import Home from '@/app/page';
afterEach(cleanup);
it('shows a server access error instead of blaming the password', async () => {
  render(<Home />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Логин' }), { target: { value: 'existing-user' } });
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Войти', exact: true }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Доступ запрещён');
  expect(screen.queryByText('Неверный логин или пароль')).not.toBeInTheDocument();
});
