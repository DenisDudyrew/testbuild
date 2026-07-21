#!/bin/bash
set -e

# ============================================================
# server-setup.sh — Первичная настройка сервера для ZEPHYR
# Запустить ОДИН РАЗ на сервере через SSH
# ============================================================

APP_DIR="/opt/testbuild"

echo "=== 1. Создаём директорию проекта ==="
sudo mkdir -p "$APP_DIR"
sudo chown "$USER:$USER" "$APP_DIR"
cd "$APP_DIR"

echo "=== 2. Создаём .env (ЗАПОЛНИ РЕАЛЬНЫМИ ЗНАЧЕНИЯМИ!) ==="
if [ ! -f .env ]; then
  cat > .env << 'ENVFILE'
DATABASE_URL=postgresql://user:your_password@db:5432/social_db
AUTH_SECRET=change_me__run_openssl_rand_-base64_32
NEXTAUTH_SECRET=change_me__run_openssl_rand_-base64_32
NEXTAUTH_URL=https://your-domain.com
AUTH_TRUST_HOST=true

POSTGRES_USER=user
POSTGRES_PASSWORD=your_password
POSTGRES_DB=social_db

SMTP_HOST=smtp.mail.ru
SMTP_PORT=465
SMTP_USER=zephyroff@internet.ru
SMTP_PASS=K0V7InXbospA7mS8jVtH
SMTP_TLS=true
SMTP_FROM=zephyroff@internet.ru
SMTP_FROM_NAME=ZEPHYR
ENVFILE
  echo ".env создан — отредактируй его перед запуском!"
else
  echo ".env уже существует, пропускаем"
fi

echo "=== 3. Скачиваем docker-compose.prod.yml ==="
curl -sL -o docker-compose.prod.yml \
  "https://raw.githubusercontent.com/$(git config --get remote.origin.url 2>/dev/null | sed 's/.*github.com[:/]//;s/\.git$//')/main/docker-compose.prod.yml" \
  || echo "(!) curl не удался — скопируй docker-compose.prod.yml вручную"

echo "=== 4. Включаем Docker без sudo ==="
sudo usermod -aG docker "$USER" 2>/dev/null || true
echo "(!) Выйди и зайди заново, чтобы группа docker применилась"

