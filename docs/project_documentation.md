# Системная документация проекта **testbuild (ZEPHYR)**

> Версия: 0.0.5 | Платформа: Next.js 16.2.10 + Prisma ORM + Socket.IO

---

## 1. Архитектура проекта

### 1.1 Общая схема

```mermaid
graph TB
    Client[Next.js Client<br/>React 19 + Tailwind CSS 4]
    Server[Next.js Server<br/>Route Handlers + Server Actions]
    Socket[Socket.IO Server<br/>WebSocket + HTTP Polling]
    DB[(PostgreSQL<br/>via Prisma ORM)]
    Redis[Upstash Redis<br/>Optional Rate Limiter]
    SMTP[SMTP / Maildev<br/>Email Verification]

    Client -->|HTTP REST| Server
    Client -->|WebSocket| Socket
    Server --> DB
    Socket --> DB
    Server --> SMTP
    Server -.->|Optional| Redis
```

### 1.2 Технологический стек

| Компонент | Технология | Назначение |
|-----------|-----------|------------|
| Фреймворк | Next.js 16.2.10 (standalone) | SSR, API Routes, Server Actions |
| Язык | TypeScript 5.x | Типизация |
| UI | React 19 + Tailwind CSS 4 + Lucide Icons | Интерфейс |
| База данных | PostgreSQL + Prisma ORM (5.22) | Хранение данных |
| Аутентификация | NextAuth v5 beta | JWT + Credentials |
| Realtime | Socket.IO 4.8 | Мессенджер, уведомления |
| Валидация | Zod 4.4 | Клиентская/серверная валидация |
| Почта | Nodemailer | Email-подтверждение |
| Rate Limiting | In-memory (fallback) / Upstash | Защита от брутфорса |
| Шифрование | AES-256-GCM (Node crypto) | Шифрование сообщений |
| Тесты | Vitest 4 + Playwright 1.61 | Unit / E2E |

---

## 2. Структура проекта

```
testbuild/
├── prisma/                      # Prisma schema & migrations
│   ├── schema.prisma            # Модели данных (22 модели)
│   ├── seed.ts                  # Сидер для тестовых данных
│   └── migrations/              # Миграции БД
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── api/                 # REST API Route Handlers
│   │   │   ├── admin/           # Админ-панель
│   │   │   ├── auth/            # Аутентификация
│   │   │   ├── bookmarks/       # Закладки
│   │   │   ├── comments/        # Комментарии (лайки, репосты)
│   │   │   ├── explore/         # Исследование
│   │   │   ├── feed/            # Лента (for-you, following)
│   │   │   ├── hashtags/        # Хэштеги (тренды)
│   │   │   ├── messenger/       # Мессенджер (чат, сообщения)
│   │   │   ├── notifications/   # Уведомления
│   │   │   ├── polls/           # Голосования
│   │   │   ├── posts/           # Посты (CRUD, лайки, пины)
│   │   │   ├── release-notes/   # Release notes
│   │   │   ├── users/           # Пользователи
│   │   │   └── upload/          # Загрузка файлов
│   │   ├── feed/               # Страница ленты
│   │   ├── messenger/          # Страница мессенджера
│   │   ├── profile/            # Профиль пользователя
│   │   ├── search/             # Поиск
│   │   └── layout.tsx          # Корневой layout
│   ├── components/             # React-компоненты
│   │   ├── messenger/          # Компоненты мессенджера
│   │   │   ├── ChatView.tsx    # Окно чата (виртуальный список)
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── MessageInput.tsx
│   │   │   ├── ConversationList.tsx
│   │   │   └── NewChatModal.tsx
│   │   ├── PostCard.tsx        # Карточка поста
│   │   ├── PostForm.tsx        # Форма создания поста
│   │   ├── Sidebar.tsx         # Боковое меню
│   │   ├── Avatar.tsx          # Компонент аватара
│   │   ├── CommentSection.tsx  # Секция комментариев
│   │   └── ...                 # Прочие компоненты
│   ├── lib/                    # Библиотеки
│   │   ├── prisma.ts           # Prisma client (singleton)
│   │   ├── auth.ts             # NextAuth конфигурация
│   │   ├── validation.ts       # Zod схемы
│   │   ├── encryption.ts       # AES-256-GCM шифрование
│   │   ├── rate-limit.ts       # Rate limiter
│   │   ├── mail.ts             # Email-рассылка
│   │   ├── socket-server.ts    # Socket.IO сервер
│   │   ├── socket-client.ts    # Socket.IO клиент (hook)
│   │   ├── views.ts            # In-memory кэш просмотров
│   │   ├── actions.ts          # Server Actions
│   │   ├── cleanup.ts          # Очистка неподтверждённых
│   │   └── hooks/usePosts.ts   # Хук работы с постами
│   ├── types/                  # TypeScript типы
│   ├── generated/              # Prisma generated
│   └── test/                   # Тесты
├── server.ts                   # HTTP сервер (Socket.IO)
├── Dockerfile
├── docker-compose.yml
└── vitest.config.ts
```

---

## 3. Модели данных (Prisma Schema)

### 3.1 ER-диаграмма

```mermaid
erDiagram
    User ||--o{ Post : "has"
    User ||--o{ Like : "creates"
    User ||--o{ Comment : "writes"
    User ||--o{ Notification : "receives"
    User ||--o{ Follow : "follows"
    User ||--o{ Bookmark : "bookmarks"
    User ||--o{ ConversationParticipant : "participates"
    User ||--o{ Message : "sends"
    User ||--o{ MessageReaction : "reacts"
    User ||--o{ Vote : "votes"
    User ||--o{ UserBlock : "blocks"
    User ||--o{ MessageDeliveryStatus : "delivery"

    Post ||--o{ Like : "has"
    Post ||--o{ Comment : "has"
    Post ||--o{ PostHashtag : "tags"
    Post ||--o{ Bookmark : "has"
    Post ||--o{ Poll : "has"
    Post ||--o{ Notification : "triggers"
    Post }o--|| Post : "repost of"

    Comment ||--o{ CommentLike : "has"
    Comment ||--o{ Comment : "replies"
    Comment ||--o{ Post : "reposted in"

    Conversation ||--o{ Message : "contains"
    Conversation ||--o{ ConversationParticipant : "has"
    Conversation ||--o{ PinnedMessage : "pins"

    Message ||--o{ MessageReaction : "has"
    Message ||--o{ MessageEditHistory : "edits"
    Message ||--o{ MessageDeliveryStatus : "status"
    Message ||--o{ Message : "replies to"
    Message ||--o{ Message : "forwards"

    Poll ||--o{ PollOption : "has"
    PollOption ||--o{ Vote : "has"

    Hashtag ||--o{ PostHashtag : "has"
    PostHashtag }o--|| Post : "belongs to"
```

---

## 4. API Endpoints

### 4.1 Аутентификация

| Метод | Endpoint | Аутентификация | Описание |
|-------|----------|----------------|----------|
| POST | `/api/auth/confirm-email` | Нет | Подтверждение email |
| POST | `/api/auth/send-verification` | Нет | Отправка кода верификации |
| POST | `/api/register` | Нет | Регистрация |
| POST | `/api/login` | Нет | Логин |

### 4.2 Посты

| Метод | Endpoint | Аутентификация | Описание |
|-------|----------|----------------|----------|
| GET | `/api/posts` | Нет | Список постов (пагинация) |
| POST | `/api/posts` | Да | Создать пост |
| GET | `/api/posts/[id]` | Нет | Получить пост |
| DELETE | `/api/posts/[id]` | Да | Удалить пост |
| PUT | `/api/posts/[id]/edit` | Да | Редактировать пост |
| POST | `/api/posts/[id]/like` | Да | Лайк/анлайк |
| POST | `/api/posts/[id]/view` | Нет | Инкремент просмотров |
| POST | `/api/posts/[id]/pin` | Да | Закрепить пост |
| GET | `/api/posts/search` | Нет | Поиск постов |

### 4.3 Лента

| Метод | Endpoint | Аутентификация | Описание |
|-------|----------|----------------|----------|
| GET | `/api/feed/for-you` | Да | Персональная лента |
| GET | `/api/feed/following` | Да | Лента подписок |

### 4.4 Комментарии

| Метод | Endpoint | Аутентификация | Описание |
|-------|----------|----------------|----------|
| GET | `/api/posts/[id]/comments` | Нет | Комментарии поста |
| POST | `/api/posts/[id]/comments` | Да | Создать комментарий |
| POST | `/api/comments/[id]/like` | Да | Лайк комментария |
| POST | `/api/comments/[id]/repost` | Да | Репост комментария |

### 4.5 Мессенджер

| Метод | Endpoint | Аутентификация | Описание |
|-------|----------|----------------|----------|
| GET | `/api/messenger/conversations` | Да | Список чатов |
| POST | `/api/messenger/conversations` | Да | Создать чат |
| GET | `/api/messenger/conversations/[id]` | Да | Получить чат |
| GET | `/api/messenger/conversations/[id]/messages` | Да | Сообщения чата |
| POST | `/api/messenger/conversations/[id]/messages` | Да | Отправить сообщение |
| DELETE | `/api/messenger/messages/[messageId]` | Да | Удалить сообщение |
| PATCH | `/api/messenger/messages/[messageId]` | Да | Редактировать сообщение |
| POST | `/api/messenger/messages/[messageId]/reactions` | Да | Реакция |
| POST | `/api/messenger/conversations/[id]/pin` | Да | Закрепить сообщение |
| POST | `/api/messenger/conversations/[id]/typing` | Да | Статус печатания |
| POST | `/api/messenger/block` | Да | Заблокировать |

### 4.6 Админ-панель

| Метод | Endpoint | Роль | Описание |
|-------|----------|------|----------|
| GET | `/api/admin/posts` | admin | Все посты |
| DELETE | `/api/admin/posts/[id]` | admin | Удалить пост |
| GET | `/api/admin/users` | admin | Все пользователи |
| PUT | `/api/admin/users/[id]` | admin | Редактировать пользователя |
| GET/POST | `/api/admin/release-notes` | admin | Release notes |

---

## 5. Безопасность

### 5.1 Шифрование (AES-256-GCM)

```
[PlantUML: docs/diagrams/uml-sequences.puml — диаграмма о шифровании (источник: docs/diagrams/uml-sequences.md)]
```

### 5.2 Rate Limiting

```
In-memory (по умолчанию):
  - Обычные эндпоинты: 30 запросов/мин
  - Чувствительные (регистрация): 10 запросов/мин

Upstash Redis (опционально):
  - Используется @upstash/ratelimit при наличии UPSTASH_REDIS_REST_URL
  - Автоматический fallback на in-memory
```

### 5.3 Аутентификация (JWT)

```
NextAuth v5 beta с Credentials provider:
  - JWT токен с полями: id, role, picture (avatar)
  - Session callback отображает JWT в сессию
  - Роли: 'user' | 'admin'
```

---

## 6. Realtime (Socket.IO)

### 6.1 Архитектура обмена сообщениями

```
[PlantUML: docs/diagrams/uml-sequences.puml — диаграмма #7]
```

### 6.2 Статус "печатает"

```
[PlantUML: docs/diagrams/uml-sequences.puml — диаграмма #8]
```

### 6.3 Онлайн-статус

```
[PlantUML: docs/diagrams/uml-sequences.puml — диаграмма #9]
```

---

## 7. Основные бизнес-процессы

### 7.1 Регистрация пользователя

```mermaid
sequenceDiagram
    participant User
    participant Client
    participant API
    participant Server
    participant DB
    participant SMTP
    
    User->>Client: Ввод email
    Client->>API: POST /api/auth/send-verification
    API->>Server: Cleanup pending users
    Server->>DB: UPSERT pending user
    Server->>SMTP: sendVerificationCode(email, code)
    SMTP-->>User: Email с кодом
    alt SMTP недоступен (локально)
        SMTP-->>Console: 🔐 Код: 123456
    end
    
    User->>Client: Ввод кода
    Client->>API: POST /api/auth/confirm-email
    Server->>DB: VERIFY code
    DB-->>Server: emailVerified = true
    
    User->>Client: Заполнение username/password
    Client->>API: POST /api/register
    Server->>DB: UPDATE user (username, password)
    DB-->>Server: User created
    API-->>Client: 201 Created
```

### 7.2 Создание поста с хэштегами

```mermaid
sequenceDiagram
    participant User
    participant Client
    participant Server
    participant DB
    
    User->>Client: Ввод текста с #хэштегами
    Client->>Client: Парсинг #хэштегов regex
    Client->>Server: Server Action: createPost(formData)
    Server->>Server: Валидация (Zod)
    loop each hashtag
        Server->>DB: upsert Hashtag(name)
        DB-->>Server: hashtag.id
    end
    Server->>DB: CREATE post + post_hashtags
    DB-->>Server: post with relations
    Server->>Server: revalidatePath("/feed")
    Server-->>Client: { post }
```

### 7.3 Лайк поста с уведомлением

```mermaid
sequenceDiagram
    participant User
    participant Client
    participant API
    participant Server
    participant DB
    
    User->>Client: Нажатие ♥
    Client->>API: POST /api/posts/[id]/like
    API->>API: Проверка аутентификации
    
    alt Лайк уже есть
        Server->>DB: DELETE like
        API-->>Client: { liked: false }
    else Новый лайк
        Server->>DB: CREATE like
        Server->>DB: GET post (for notification)
        Server->>DB: IF sender != post author
        Server->>DB: CREATE notification
        API-->>Client: { liked: true, _count: { likes } }
    end
```

### 7.4 Отправка сообщения (Optimistic UI)

```mermaid
sequenceDiagram
    participant User
    participant Client
    participant Socket
    participant API
    participant DB
    participant Recipient
    
    User->>Client: Отправка сообщения
    Client->>Client: Создание temp-сообщения
    Client->>Client: Добавление в список (optimistic)
    
    par API запрос
        Client->>API: POST /api/messenger/conversations/[id]/messages
        API->>DB: SAVE { content: encrypted }
        DB-->>API: saved message
        API-->>Client: { id, content, ... }
        Client->>Client: Замена temp на реальное
    and Socket.IO
        Client->>Socket: message:send({ conversationId, message })
        Socket->>Recipient: message:new(message)
    and Polling fallback
        Recipient->>API: GET messages (каждые 15 сек)
        API-->>Recipient: новые сообщения
    end
```

---

## 8. UI Компоненты

### 8.1 Схема навигации

```mermaid
graph LR
    Home["/ (Login)"] -->|auth| Feed["/feed"]
    Feed -->|"view profile"| Profile["/profile/[id]"]
    Feed -->|"search"| Search["/search"]
    Feed -->|"bookmarks"| Bookmarks["/bookmarks"]
    Feed -->|"messenger"| Messenger["/messenger"]
    Feed -->|"notifications"| Notifications["/notifications"]
    Feed -->|"admin"| Admin["/admin"]
    Feed -->|"updates"| Updates["/updates"]
```

---

## 9. Настройка переменных окружения

```env
# База данных
DATABASE_URL="postgresql://user:pass@localhost:5432/testbuild"

# Аутентификация
AUTH_SECRET="your-secret-at-least-32-chars"

# Шифрование сообщений
ENCRYPTION_KEY="your-encryption-key"

# SMTP (опционально - для локальной разработки Maildev)
SMTP_HOST="localhost"
SMTP_PORT=1025
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="noreply@zephyr.app"
SMTP_FROM_NAME="ZEPHYR"

# Upstash Redis (опционально - rate limiting)
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""
```

---

## 10. Тестирование

### 10.1 Тестовое покрытие

| Файл тестов | Что тестирует |
|-------------|---------------|
| `encryption.test.ts` | AES шифрование/дешифрование |
| `rate-limit.test.ts` | Rate limiter работа |
| `validation.test.ts` | Zod схемы валидации |
| `views.test.ts` | Кэш просмотров |
| `actions.test.ts` | Server Actions |
| `api-routes.test.ts` | REST API endpoints |
| `api.test.ts` | Интеграционные тесты API |
| `cleanup.test.ts` | Очистка пользователей |
| `messenger.test.ts` | Функции мессенджера |
| **Итого** | **9 тестовых файлов** |

---

## 11. Найденные проблемы и рекомендации

### 11.1 Критические баги

| # | Файл | Проблема | Статус |
|---|------|----------|--------|
| 1 | `src/lib/rate-limit.ts:7` | setInterval на уровне модуля - не очищается после тестов | Нужно добавить cleanup |

### 11.2 Проблемы производительности

| # | Файл | Проблема |
|---|------|----------|
| 1 | `src/components/messenger/ChatView.tsx` | Рассчёт `listItems` на каждый ререндер (useMemo, но зависимости частые) |
| 2 | `src/lib/hooks/usePosts.ts` | `fetch` для комментариев при открытии - не кэшируется |
| 3 | `src/app/feed/page.tsx` | feedPosts обновляется через `loadMore` без debounce |

### 11.3 Рекомендации по коду

| # | Файл | Рекомендация |
|---|------|-------------|
| 1 | `package.json` | Удалить дублирующиеся библиотеки: `bcrypt` и `bcryptjs` - достаточно одной |
| 2 | `src/lib/socket-client.ts:134` | `getSocket()` возвращает `null` - функция не используется |
| 3 | `src/app/api/socketio/route.ts` | Route handler только для health-check - Socket.IO работает через upgrade |
| 4 | Во всех Route Handlers | Использовать `NextRequest` вместо `Request` для совместимости |