# ZEPHYR — социальная сеть

Современная социальная сеть на Next.js 16, React 19, TailwindCSS v4, Prisma и NextAuth v5.

## Стек

- **Фреймворк:** Next.js 16.2.10 (App Router, Turbopack)
- **UI:** React 19.2.4, TailwindCSS v4, lucide-react
- **База данных:** PostgreSQL + Prisma ORM
- **А��тентификация:** NextAuth v5 (bcrypt, AES-256-GCM для email)
- **Валидация:** Zod
- **Контейнеризация:** Docker (multi-stage), docker-compose

---

# Zephyr — Initial Release v0.0.1

## Возможности

### Аутентификация и регистрация
- Регистрация по email с подтверждением через 6-значный код
- Вход по username + пароль
- Защита персональных данных: email шифруется (AES-256-GCM), пароли хешируются (bcrypt)
- Защита от злоупотреблений: rate limiting (in-memory sliding window, 30 req/min общий, 10 req/min строгий)
- Zod-валидация всех входных данных

### Профили
- Аватар, шапка (cover), био, статистика (посты, подписки)
- Редактирование профиля (username, био, аватар, шапка)
- Удаление аккаунта
- Публикация постов со страницы профиля (только для своего профиля)
- Адаптивный дизайн: центрирование на мобилках, адаптивные размеры аватара

### Лента
- ��оздание и редактирование постов (10-минутное окно редактирования)
- Репосты с комментарием (модальное окно)
- Лайки с анимацией
- Комментарии с ответами (thread) и лайками на комментарии
- Репост комментариев как отдельного поста (с возможностью добавить свой текст + отображение исходного поста)
- Трекинг просмотров (IP-based дедупликация)
- Пагинация (кнопка «Загрузить ещё»)

### Поиск и Explore
- Поиск пользователей по username
- Блок популярных пользователей и постов

### Уведомления
- Уведомления о лайках, комментариях и репостах
- Счётчик непрочитанных
- Авто-отметка прочитанными при просмотре

### Админ-панель
- Управление пользователями (смена username и роли: USER / ADMIN / MODERATOR)
- Управление постами (просмотр, удаление)
- Публикация release notes (с Rich Text Editor)

### Release Notes
- Публичные release notes на странице `/updates`
- Администрирование через админ-панель

### Анимации и UI
- 12 CSS-анимаций: fadeIn, slideIn, bounceIn, scaleIn, shimmer, float, slideUp, like, highlight, pulseGlow, rise, stagger-1…8
- Hover/active эффекты на всех интерактивных элементах
- Анимации на всех страницах (feed, profile, search, notifications, updates, admin)
- Рамки аватарок с ховер-эффектом
- Адаптивный сайдбар с анимацией открытия/закрытия

### Мобильная версия
- Адаптивный сайдбар (выезжает с оверлеем)
- Кнопка гамбургер / крестик с анимацией
- `max-md:pl-0` на всех страницах
- Адаптивные отступы, размеры, центрирование

---

## Release Notes

### v0.0.1 — Initial Release

#### Core
- Разбивка `feed/page.tsx` (816 → 120 строк) на компоненты: PostCard, PostForm, CommentSection, usePosts
- Строгие TypeScript-интерфейсы вместо `any` (Post, Comment, User, PaginatedResponse<T> �� др.)
- Zod-валидация (6 схем: регистрация, пост, комментарий, профиль, пользователь, release notes)
- Rate limiting (in-memory sliding window, 30/10 req/min)

#### Посты и комментарии
- Пагинация ленты (skip/take + total)
- Лайки на комментарии (CommentLike модель, API, UI)
- Репост комментариев (repostedCommentId, API, модалка с текстом + исходный пост)
- Посты из профиля (PostForm на своей странице, появление в ленте)

#### UI/UX
- 12 CSS-анимаций (fadeIn, slideIn, bounceIn, scaleIn, shimmer, float, slideUp, like, highlight, pulseGlow, rise, stagger)
- Анимации на всех страницах (feed, profile, search, notifications, updates, admin)
- Рамки аватарок (ring-2, hover:ring-indigo-400)
- Анимация кнопки сайдбара (гамбургер → крестик)
- Убраны кнопки «Назад» из /search и /notifications

#### Мобильная адаптация
- Адаптивный сайдбар с оверлеем
- Фикс названий в сайдбаре на мобилках
- Фикс аватара профиля (адап��ивный размер, aspect-square)
- Фикс заголовков (pl-12 sm:pl-0, чтобы не перекрывались гамбургером)
- Центрирование текста/статистики на мобилках

#### Админка
- Редактирование пользователей (username, роль)
- Inline-редактирование с select и Confirm/Cancel

#### Прочее
- Счётчик просмотров (IP-based дедупликация)
- Авто-миграция БД при старте контейнера (prisma migrate deploy)

---

## Известные ограничения

- **Подписки и подписчики** — не реализованы (в плане)
- **Уведомления** — только в приложении (email/Push — в плане)
- **Медиа** — только загрузка на сервер (S3/CDN — в плане)
- **Лента подписок** — нет (только общая лента всех постов)
- **Мессенджер** — общение между пользователями не реализовано
- **Тесты** — unit и E2E тесты отсутствуют
- **CI/CD** — GitHub Actions требует настройки
- **Error tracking** — нет Sentry или централизованного логирования

---

## Требования к окружению

- Node.js 20+
- PostgreSQL 15+
- npm / yarn / pnpm / bun
- Docker (опционально)

## Переменные окружения

```env
# База данных
DATABASE_URL=postgresql://user:password@localhost:5432/zephyr

# NextAuth
AUTH_SECRET=your-secret-here
AUTH_URL=http://localhost:3000

# Email (SMTP)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=password

# Шифрование email
ENCRYPTION_KEY=your-32-byte-hex-key

# Загрузка файлов
UPLOAD_DIR=./uploads
```

## Быстрый старт

```bash
# Установка зависимостей
npm install

# Генерация Prisma клиента
npx prisma generate

# Миграция БД
npx prisma migrate dev

# Запуск dev-сервера
npm run dev
```

Открой [http://localhost:3000](http://localhost:3000).

## Docker

```bash
docker compose up -d
```

Миграции накатываются автоматически при старте контейнера (`prisma migrate deploy` в `docker-entrypoint.sh`).

## Структура проекта

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # API routes
│   │   ├── admin/          # Админ-панель
│   │   ├── auth/           # Аутентификация
│   │   ├── posts/          # Посты, комментарии, лайки, репосты
│   │   │   ├── [id]/       # Детали, редактирование, удаление
│   │   │   │   ├── comments/    # Комментарии к посту
│   │   │   │   ├── like/        # Лайк поста
│   │   │   │   └── view/        # Просмотр поста
│   │   │   └── ...
│   │   ├── comments/       # Комментарии
│   │   │   └── [id]/
│   │   │       ├── like/        # Лайк комментария
│   │   │       └── repost/      # Репост комментария
│   │   ├── users/          # Пользователи
│   │   └── ...
│   ├── admin/              # Админ-страницы
│   ├── feed/               # Лента
│   ├── profile/            # Профили
│   └── ...
├── components/             # React-компоненты
│   ├── PostCard.tsx        # Карточка поста (с репостами, лайками, медиа)
│   ├── PostForm.tsx        # Форма поста (в ленте и профиле)
│   ├── CommentSection.tsx  # Комментарии (с репостами, лайками)
│   ├── CommentItem.tsx     # Комментарий (с лайками, ответами, репостом)
│   ├── ReplyItem.tsx       # Ответ на комментарий (с лайками, репостом)
│   ├── CommentRepostModal.tsx # Модалка репоста комментария (с текстом + исходный пост)
│   ├── Sidebar.tsx         # Сайдбар (адаптивный, с иконками и названиями)
│   ├── ViewTracker.tsx     # Трекер просмотров
│   └── ...
├── hooks/                  # React-хуки
│   └── usePosts.ts         # Хук ленты с пагинацией, лайками, комментариями
├── lib/                    # Утилиты
│   ├── prisma.ts           # Prisma клиент
│   ├── validation.ts       # Zod схемы (6 схем)
│   ├── rate-limit.ts       # In-memory rate limiting
│   └── ...
└── types/                  # TypeScript типы
    └── post.ts             # Интерфейсы Post, Comment, User, RepostedComment, API responses
```

## Миграция БД (для новых моделей)

```bash
npx prisma migrate dev --name add_comment_likes
```

При деплое через Docker миграции накатываются автоматически — `prisma migrate deploy` в `docker-entrypoint.sh`.

### 1. Разбивка крупных компонентов

`feed/page.tsx` (было 816 строк) разбит на:

| Компонент | Файл | Назначение |
|---|---|---|
| `PostCard` | `src/components/PostCard.tsx` | Карточка поста: лайки, репосты, редактирование, удаление, медиа |
| `PostForm` | `src/components/PostForm.tsx` | Форма создания поста с загрузкой медиа |
| `CommentSection` | `src/components/CommentSection.tsx` | Секция комментариев с ответами, реакциями, лайками |
| `usePosts` | `src/hooks/usePosts.ts` | Хук с логикой ленты: пагинация, лайки, комментарии, управление состоянием |

### 2. Строгие TypeScript-интерфейсы

Вместо `any` — строгие типы в `src/types/post.ts`:
- `Post`, `Comment`, `User`, `MediaUpload`
- `CreatePostInput`, `CreateCommentInput`, `LikeResponse`
- `PaginatedResponse<T>` для API с пагинацией

### 3. Пагинация ленты

- API `GET /api/posts?page=1&limit=10` — `skip/take` + `total`
- UI: кнопка «Загрузить ещё»
- Лайки обновляются без перезагрузки всех постов

### 4. Zod-валидация

Библиотека `zod` + схемы в `src/lib/validation.ts`:
- `registerSchema` — регистрация (username, email, password)
- `createPostSchema` — создание поста (content, mediaUrl, mediaType)
- `createCommentSchema` — комментарий (content, postId, parentId)
- `updateProfileSchema` — профиль (username, bio, avatar, cover)
- `updateUserSchema` — редактирование юзера админом
- `releaseNoteSchema` — релиз-ноты

Валидация внедрена в API: `/api/register`, `/api/posts`, `/api/comments`.

### 5. Rate limiting

Защита от злоупотреблений через `src/lib/rate-limit.ts` (in-memory sliding window):
- 30 запросов/мин — общий лимит
- 10 запросов/мин — строгий (регистрация, лайки)
- Возвращает `Retry-After` header

Внедрён в `/api/register`, `/api/posts/[id]/like`, `/api/comments`.

### 6. Лайки на комментарии

- Новая модель `CommentLike` в Prisma
- API `POST /api/comments/[id]/like`
- Компоненты `CommentItem` и `ReplyItem` с кнопками лайков

### 7. Мобильная версия

- Адаптивный сайдбар (выезжает с оверлеем на мобильных)
- Кнопка гамбургера для сворачивания/разворачивания
- `max-md:pl-0` на всех страницах (feed, search, profile, notifications, updates, admin)
- Адаптивные отступы и размеры

### 8. Анимации

Все анимации в `src/app/globals.css`:
- `animate-fadeIn` — плавное появление
- `animate-slideIn` — выезд снизу
- `animate-like` — эффект «pop» при лайке (scale 1 → 1.3 → 1)
- `animate-highlight` — подсветка нового комментария
- `animate-pulseGlow` — пульсирующее свечение
- `animate-rise` — подъём карточки поста с задержкой
- `hover:scale-105`, `active:scale-95` на интерактивных элементах

### 9. Рамки аватарок

- `ring-2 ring-zinc-200` на аватарках в профиле, посте, сайдбаре
- `hover:ring-indigo-400` при наведении
- `shadow-lg` на аватарке профиля

### 10. Редактирование пользователей в админке

- API `PUT /api/admin/users/[id]` — смена username и роли
- UI с инлайн-редактированием, select для роли, кнопки Confirm/Cancel

### 11. Счётчик просмотров

- IP-based дедупликация (один человек — один просмотр)
- Компонент `ViewTracker` с `Set<string>` для отслеживания просмотренных постов

### 12. Репост комментариев

Комментарии теперь можно репостить как отдельный пост:
- Prisma: поле `repostedCommentId` в модели `Post` + связь `CommentReposts` в `Comment`
- API `POST /api/comments/[id]/repost` — создаёт пост с привязкой к репостнутому комментарию
- Кнопка `Repeat2` в каждом `CommentItem` и `ReplyItem`
- В `PostCard` отображается блок с индиго-оттенком: имя автора, контент, счётчик лайков исходного комментария
- В `profile/page.tsx` тоже отображаются репосты комментариев

### 13. Посты из профиля

Пользователи могут писать посты со своей страницы профиля:
- `PostForm` добавлен на `/profile/[id]`, отображается только для своего профиля
- Новые посты сразу появляются в общей ленте
- Чужие профили — только просмотр, комментарии, лайки, репосты

### 14. Улучшенные анимации

Добавлены новые анимации в `src/app/globals.css`:
- `animate-bounceIn` — упругий вход с эффектом пружины
- `animate-scaleIn` — плавное масштабирование
- `animate-shimmer` — мерцающий эффект (для загрузки, акцентов)
- `animate-float` — парение (для карточек, кнопок)
- `animate-slideUp` — выезд снизу (для модалок, уведомлений)
- `animate-stagger-1`…`animate-stagger-8` — каскадные задержки для списков

Анимации применены к: кнопкам, карточкам постов, комментариям, лайкам, сайдбару.

### 15. Мобильные фиксы

- **Сайдбар**: названия пунктов меню теперь всегда видны (убрано `hidden sm:inline`)
- **Аватар профиля**: адаптивный размер `size-24` на мобилках, `size-32` на десктопе; `aspect-square` в редакторе — не растягивается
- **Текст / статистика профиля**: центрируются на мобилках (`text-center md:text-left`)
- **Лента**: убран поиск пользователей, вместо него — заголовок «Лента» с анимацией `animate-slideIn`

### 16. Модалка репоста комментария

Репост комментария теперь работает через модальное окно (аналог репоста поста):
- **Новый компонент** `CommentRepostModal.tsx` — текстовое поле для своего комментария + блок с репостнутым комментарием + блок с оригинальным постом
- Кнопка `Repeat2` в `CommentItem` и `ReplyItem` открывает модалку вместо прямого репоста
- API `/api/comments/[id]/repost` принимает опциональный `content` (текст пользователя)
- В `PostCard` и `profile/page.tsx` блок репостнутого комментария показывает исходный пост (автор, текст, медиа)

### 17. Анимации на всех страницах

Единый стиль анимаций для всех окон приложения:
- **`/search`** — заголовок `animate-slideIn`, контейнер и пустое состояние `animate-fadeIn`
- **`/notifications`** — заголовок `animate-slideIn`, страница `animate-fadeIn`, пустое состояние `animate-fadeIn`
- **`/updates`** — иконка `animate-bounceIn`, заголовок `animate-slideIn`, страница `animate-fadeIn`
- **`/admin`** — заголовок `animate-slideIn`, все табы `animate-fadeIn`
- **Все окна** — `pl-12 sm:pl-0` для заголовков, чтобы гамбургер не перекрывал текст на мобилках

### 18. Убраны кнопки «Назад»

Из окон `/search` и `/notifications` удалены кнопки навигации назад (`ArrowLeft` + `router.back()`) как избыточный функционал.

### 19. Анимация кнопки сайдбара

- **Гамбургер** (`Menu`) — плавно исчезает (`scale-0 opacity-0 pointer-events-none`) при открытии сайдбара
- **Крестик** (`X`) — появляется в правом верхнем углу сайдбара анимированно (`scale-100 opacity-100`) только когда сайдбар открыт
- На десктопе крестик скрыт (`sm:hidden`)
- Логотип и название ZEPHYR больше не перекрываются кнопкой закрытия

## Требования к окружению

- Node.js 20+
- PostgreSQL 15+
- npm / yarn / pnpm / bun

## Переменные окружения

```env
# База данных
DATABASE_URL=postgresql://user:password@localhost:5432/zephyr

# NextAuth
AUTH_SECRET=your-secret-here
AUTH_URL=http://localhost:3000

# Email (SMTP)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=password

# Шифрование email
ENCRYPTION_KEY=your-32-byte-hex-key

# Загрузка файлов
UPLOAD_DIR=./uploads
```

## Быстрый старт

```bash
# Установка зависимостей
npm install

# Генерация Prisma клиента
npx prisma generate

# Миграция БД
npx prisma migrate dev

# Запуск dev-сервера
npm run dev
```

Открой [http://localhost:3000](http://localhost:3000).

## Docker

```bash
docker-compose up -d
```

## Структура проекта

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # API routes
│   │   ├── admin/          # Админ-панель
│   │   ├── auth/           # Аутентификация
│   │   ├── posts/          # Посты, комментарии, лайки, репосты
│   │   │   ├── [id]/       # Детали, редактирование, удаление
│   │   │   │   ├── comments/    # Комментарии к посту
│   │   │   │   ├── like/        # Лайк поста
│   │   │   │   └── view/        # Просмотр поста
│   │   │   └── ...
│   │   ├── comments/       # Комментарии
│   │   │   └── [id]/
│   │   │       ├── like/        # Лайк комментария
│   │   │       └── repost/      # Репост комментария
│   │   ├── users/          # Пользователи
│   │   └── ...
│   ├── admin/              # Админ-страницы
│   ├── feed/               # Лента
│   ├── profile/            # Профили
│   └── ...
├── components/             # React-компоненты
│   ├── PostCard.tsx        # Карточка поста (с репостами, лайками, медиа)
│   ├── PostForm.tsx        # Форма поста (в ленте и профиле)
│   ├── CommentSection.tsx  # Комментарии (с репостами, лайками)
│   ├── CommentItem.tsx     # Комментарий (с лайками, ответами, репостом)
│   ├── ReplyItem.tsx       # Ответ на комментарий (с лайками, репостом)
│   ├── CommentRepostModal.tsx # Модалка репоста комментария (с текстом + исходный пост)
│   ├── Sidebar.tsx         # Сайдбар (адаптивный, с иконками и названиями)
│   ├── ViewTracker.tsx     # Трекер просмотров
│   └── ...
├── hooks/                  # React-хуки
│   └── usePosts.ts         # Хук ленты с пагинацией, лайками, комментариями
├── lib/                    # Утилиты
│   ├── prisma.ts           # Prisma клиент
│   ├── validation.ts       # Zod схемы (6 схем)
│   ├── rate-limit.ts       # In-memory rate limiting
│   └── ...
└── types/                  # TypeScript типы
    └── post.ts             # Интерфейсы Post, Comment, User, RepostedComment, API responses
```

## Миграция БД (для новых моделей)

```bash
npx prisma migrate dev --name add_comment_likes
