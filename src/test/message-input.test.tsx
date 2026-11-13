import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MessageInput from '@/components/messenger/MessageInput';
vi.mock('@/components/ToastProvider', () => ({ useToast: () => ({ showAlert: vi.fn() }) }));
afterEach(cleanup);

describe('Message draft safety', () => {
  it('keeps the draft when sending fails', async () => {
    const onSend = vi.fn().mockResolvedValue(false);
    render(<MessageInput onSend={onSend} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Сообщение' }), { target: { value: 'не теряй меня' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledOnce());
    expect(screen.getByRole('textbox')).toHaveValue('не теряй меня');
  });
  it('prevents double sends and clears the draft only after acknowledgement', async () => {
    let resolve!: (success: boolean) => void;
    const onSend = vi.fn(() => new Promise<boolean>(done => { resolve = done; }));
    render(<MessageInput onSend={onSend} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'hello' } });
    const send = screen.getByRole('button', { name: 'Отправить сообщение' });
    fireEvent.click(send); fireEvent.click(send);
    expect(onSend).toHaveBeenCalledOnce();
    expect(input).toHaveValue('hello');
    resolve(true);
    await waitFor(() => expect(input).toHaveValue(''));
  });
});
