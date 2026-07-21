import nodemailer from 'nodemailer';

function createMailTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 1025;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const tls = process.env.SMTP_TLS === 'true';

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    ...(tls ? { tls: { rejectUnauthorized: true } } : {}),
    ...(user && pass ? {
      auth: { user, pass },
    } : {}),
  });
}

export async function sendVerificationCode(email: string, code: string): Promise<void> {
  const fromName = process.env.SMTP_FROM_NAME || 'ZEPHYR';
  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@zephyr.app';
  const host = process.env.SMTP_HOST || 'localhost';
  const port = Number(process.env.SMTP_PORT) || 1025;

  const isLocal = host === 'localhost' || host === '127.0.0.1';

  // Если почта локальная и Maildev недоступен — код в консоль
  if (isLocal) {
    const isAvailable = await checkPort(host, port);
    if (!isAvailable) {
      console.log('\n═══════════════════════════════════════');
      console.log(`  🔐 Код подтверждения для ${email}: ${code}`);
      console.log('  (Maildev выключен — код показан в консоли)');
      console.log('═══════════════════════════════════════\n');
      return;
    }
  }

  const transporter = createMailTransport();

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: email,
      subject: 'Код подтверждения — ZEPHYR',
      html: buildEmailHtml(code),
    });
  } catch (error: any) {
    console.error('\n❌ Ошибка отправки email через SMTP:', error.message || error);
    if (error.code === 'EAUTH') {
      throw new Error('Ошибка аутентификации SMTP: проверьте логин/пароль. Для Яндекса нужен пароль приложения, а не обычный пароль.');
    }
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      throw new Error(`Не удалось подключиться к SMTP-серверу (${host}:${port}). Проверьте настройки.`);
    }
    throw new Error(`Ошибка SMTP: ${error.message || error}`);
  }
}

/** Попытаться подключиться к порту, чтобы проверить, запущен ли Maildev */
async function checkPort(host: string, port: number): Promise<boolean> {
  try {
    const net = await import('net');
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(2000);
      socket.on('connect', () => { socket.destroy(); resolve(true); });
      socket.on('error', () => resolve(false));
      socket.on('timeout', () => { socket.destroy(); resolve(false); });
      socket.connect(port, host);
    });
  } catch {
    return false;
  }
}

function buildEmailHtml(code: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border-radius: 12px; border: 1px solid #e4e4e7;">
      <div style="font-size: 24px; font-weight: 600; color: #18181b; margin-bottom: 8px;">ZEPHYR</div>
      <p style="color: #52525b; font-size: 14px; margin: 0 0 24px 0;">
        Ваш код подтверждения для регистрации аккаунта:
      </p>
      <div style="background: #f4f4f5; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
        <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #18181b; font-family: 'Courier New', monospace;">${code}</span>
      </div>
      <p style="color: #71717a; font-size: 13px; margin: 0;">
        Код действителен в течение 10 минут. Никому не сообщайте этот код.
      </p>
    </div>
  `;
}
