# UML Sequence Diagrams — ZEPHYR Project

## 1. Регистрация пользователя

```mermaid
sequenceDiagram
    actor User as Пользователь
    participant Client as Next.js Client
    participant API as Route Handler
    participant Server as Next.js Server
    participant DB as PostgreSQL
    participant SMTP as Maildev/SMTP

    User->>Client: Ввод email
    Client->>API: POST /api/auth/send-verification
    API->>Server: Валидация email
    Server->>Server: cleanupPendingUsers()
    Server->>DB: UPSERT user (emailHash, verificationCode, expiresAt)
    DB-->>Server: user created
    Server->>SMTP: sendVerificationCode(email, code)
    alt SMTP недоступен (localhost)
        SMTP-->>Console: 🔐 Код подтверждения: {code}
    else SMTP доступен
        SMTP-->>User: Email с кодом
    end
    API-->>Client: { success: true }

    User->>Client: Ввод кода
    Client->>API: POST /api/auth/confirm-email { email, code }
    Server->>DB: FIND user by emailHash
    DB-->>Server: user data
    Server->>Server: Проверка: code совпадает, не истёк
    Server->>DB: UPDATE user (emailVerified = true)
    DB-->>Server: confirmed
    API-->>Client: { success: true }

    User->>Client: Ввод username + password
    Client->>API: POST /api/register
    API->>Server: Rate limit check (10/мин)
    Server->>Server: Валидация (Zod)
    Server->>DB: CHECK emailVerified
    DB-->>Server: verified
    Server->>DB: CHECK username уникальность
    DB-->>Server: unique
    Server->>Server: bcrypt.hash(password, 10)
    Server->>DB: UPDATE user (username, password, clear verificationCode)
    DB-->>Server: updated
    API-->>Client: 201 { id, username, avatar }
```

## 2. Аутентификация (Login/JWT)

```mermaid
sequenceDiagram
    actor User as Пользователь
    participant Client as Next.js Client
    participant NextAuth as NextAuth v5
    participant DB as PostgreSQL

    User->>Client: Ввод логина/пароля
    Client->>NextAuth: signIn("credentials", { username, password })
    NextAuth->>DB: prisma.user.findUnique({ where: { username } })
    DB-->>NextAuth: user { id, username, password, role, avatar }
    NextAuth->>NextAuth: bcrypt.compare(password, user.password)
    alt Неверный пароль
        NextAuth-->>Client: error: "CredentialsSignin"
    else Верный пароль
        NextAuth->>NextAuth: JWT callback — загрузка role, avatar
        NextAuth->>NextAuth: Session callback — отображение JWT в сессию
        NextAuth-->>Client: session { user: { id, name, role, image } }
        Note over Client: Сессия сохранена в httpOnly cookie
    end
```

## 3. Создание поста с хэштегами

```mermaid
sequenceDiagram
    actor User as Пользователь
    participant Client as React Client
    participant Action as Server Action
    participant DB as PostgreSQL

    User->>Client: Ввод текста "#привет #zephyr"
    Client->>Client: Парсинг хэштегов: /#[\wа-яё]+/gi
    Client-->>Action: createPost(formData)
    
    Action->>Action: auth() — проверка сессии
    Action->>Action: validate(createPostSchema, data)
    Action->>Action: Проверка: content || mediaUrl
    
    Note over Action: Для каждого уникального хэштега
    loop each hashtag
        Action->>DB: prisma.hashtag.upsert({ where: { name }, create: { name } })
        DB-->>Action: hashtag { id, name }
    end
    
    Action->>DB: prisma.post.create({ data: { userId, content, hashtags: { create: [...] } }, include: { user } })
    DB-->>Action: post with user
    
    Action->>Action: revalidatePath("/feed")
    Action-->>Client: { post }
    
    Client->>Client: Обновление ленты
```

## 4. Лайк поста + уведомление

```mermaid
sequenceDiagram
    actor UserA as Пользователь A
    participant Client as React Client
    participant API as Route Handler
    participant DB as PostgreSQL

    UserA->>Client: Нажатие ♥ (лайк)
    Client->>API: POST /api/posts/{postId}/like
    API->>API: auth() — проверка сессии
    
    API->>DB: prisma.like.findUnique({ where: { userId_postId } })
    DB-->>API: existing like or null
    
    alt Лайк уже существует
        API->>DB: prisma.like.delete({ where: { id } })
        DB-->>API: deleted
        API-->>Client: { liked: false }
    else Новый лайк
        API->>DB: prisma.like.create({ data: { userId, postId } })
        DB-->>API: like { id }
        
        API->>DB: prisma.post.findUnique({ where: { id: postId } })
        DB-->>API: post { userId: authorId }
        
        alt Лайкнувший ≠ автор поста
            API->>DB: prisma.notification.create({ data: { userId: authorId, type: "like", actorId, postId, likeId } })
            DB-->>API: notification created
        end
        
        API-->>Client: { liked: true, _count: { likes: N } }
    end
    
    Client->>Client: toggleLikedPosts(postId)
    Client->>Client: updateFeedPostsCount(postId, likes+1)
```

## 5. Комментарий + уведомление

```mermaid
sequenceDiagram
    actor UserA as Пользователь A
    participant Client as React Client
    participant API as Route Handler
    participant DB as PostgreSQL

    UserA->>Client: Нажатие "Ответить"
    Client->>Client: toggleExpandedComments(postId)
    Client->>API: GET /api/posts/{postId}/comments
    API->>DB: prisma.comment.findMany({ where: { postId }, include: { user, replies, likes } })
    DB-->>API: comments[]
    API-->>Client: comments[]

    UserA->>Client: Ввод текста комментария
    Client->>API: POST /api/posts/{postId}/comments { content, parentId? }
    API->>API: auth(), validate(createCommentSchema)
    API->>DB: prisma.comment.create({ data: { userId, postId, content, parentId }, include: { user } })
    DB-->>API: comment { id, content, user }
    
    API->>DB: prisma.post.findUnique({ where: { id: postId } })
    DB-->>API: post { userId: authorId }
    
    alt Комментатор ≠ автор поста
        API->>DB: prisma.notification.create({ data: { userId: authorId, type: "comment", actorId, postId, commentId } })
    end
    
    API-->>Client: 201 { comment }
    Client->>Client: addComment(postId, comment)
    Client->>Client: updatePostCount(postId, comments+1)
```

## 6. Подписка на пользователя

```mermaid
sequenceDiagram
    actor UserA as Пользователь A
    actor UserB as Пользователь B
    participant Client as React Client
    participant Action as Server Action
    participant DB as PostgreSQL

    UserA->>Client: Нажатие "Подписаться" на UserB
    Client->>Action: toggleFollow(userBId)
    Action->>Action: auth() — проверка сессии
    Action->>Action: Проверка: userId !== targetUserId
    
    Action->>DB: prisma.follow.findUnique({ where: { followerId_followingId } })
    DB-->>Action: existing follow or null
    
    alt Уже подписан
        Action->>DB: prisma.follow.delete({ where: { id } })
        DB-->>Action: deleted
        Action-->>Client: { followed: false }
        Client->>Client: Обновление UI — кнопка "Подписаться"
    else Не подписан
        Action->>DB: prisma.follow.create({ data: { followerId, followingId } })
        DB-->>Action: created
        Action-->>Client: { followed: true }
        Client->>Client: Обновление UI — кнопка "Отписаться"
    end
    
    Action->>Action: revalidatePath("/profile/{userId}")
```

## 7. Отправка сообщения (Optimistic UI + Socket.IO)

```mermaid
sequenceDiagram
    actor UserA as Пользователь A
    actor UserB as Пользователь B
    participant ClientA as Client A
    participant SocketA as Socket.IO Client
    participant Server as Socket.IO Server
    participant API as REST API
    participant DB as PostgreSQL
    participant ClientB as Client B
    participant SocketB as Socket.IO Client

    UserA->>ClientA: Написание сообщения + Enter
    
    ClientA->>ClientA: localIdCounter++
    ClientA->>ClientA: Создание temp-сообщения { id: "temp-N", content, senderId }
    ClientA->>ClientA: Оптимистичное добавление в список
    
    par HTTP запрос
        ClientA->>API: POST /api/messenger/conversations/{id}/messages { content, replyToId?, mediaUrl? }
        API->>API: auth() — проверка сессии
        API->>API: validate(sendMessageSchema)
        API->>API: encrypt(content) → "iv:tag:ciphertext"
        API->>DB: prisma.message.create({ data: { conversationId, senderId, content: encrypted, searchContent, ... } })
        DB-->>API: message { id, createdAt, ... }
        API->>API: decrypt(content) → plaintext для ответа
        API-->>ClientA: { id, content, createdAt, sender, ... }
        ClientA->>ClientA: Замена temp-message на реальный
    and Socket.IO broadcast
        ClientA->>SocketA: message:send({ conversationId, message })
        SocketA->>Server: Проверка: senderId === socket.userId
        Server->>Server: Rate limit: 30 msgs/min
        Server->>SocketB: broadcast.to("conversation:{id}") emit("message:new", message)
        Server->>SocketB: broadcast emit("conversation:update", { conversationId, lastMessage })
        SocketB-->>ClientB: Обновление UI — новое сообщение + обновление списка чатов
    and Fallback polling
        ClientB->>API: GET /api/messenger/conversations/{id}/messages?limit=50
        API-->>ClientB: messages[]
        ClientB->>ClientB: Синхронизация при отсутствии Socket.IO
    end
```

## 8. Статус "печатает" (Typing Indicator)

```mermaid
sequenceDiagram
    actor UserA as Пользователь A
    actor UserB as Пользователь B
    participant ClientA as Client A
    participant SocketA as Socket A
    participant Server as Socket.IO Server
    participant SocketB as Socket B
    participant ClientB as Client B

    UserA->>ClientA: Начало ввода (onChange)
    ClientA->>ClientA: debounce 500ms
    
    ClientA->>SocketA: typing:start({ conversationId, userId, username })
    SocketA->>Server: Проверка: userId === socket.data.userId
    Server->>Server: Rate limit: 60 typing events/min
    
    Server->>Server: Сохранение таймаута (5 сек)
    Server->>Server: broadcastTyping()
    Server->>SocketB: emit("typing:update", { conversationId, typing: [{ id, username }] })
    SocketB-->>ClientB: Показ "UserA печатает..."
    
    alt UserA прекратил ввод (таймаут 5 сек)
        Server->>Server: setTimeout → convTyping.delete(userId)
        Server->>Server: broadcastTyping()
        Server->>SocketB: emit("typing:update", { conversationId, typing: [] })
        SocketB-->>ClientB: Скрытие индикатора
    else UserA отправил сообщение
        UserA->>ClientA: Send message
        ClientA->>SocketA: typing:stop({ conversationId })
        SocketA->>Server: clearTypingForSocket()
        Server->>SocketB: emit("typing:update", { conversationId, typing: [] })
        SocketB-->>ClientB: Скрытие индикатора
    end
```

## 9. Онлайн-статус

```mermaid
sequenceDiagram
    actor UserA as Пользователь A
    actor UserB as Пользователь B
    participant ClientA as Client A
    participant SocketA as Socket A
    participant Server as Socket.IO Server
    participant SocketB as Socket B
    participant ClientB as Client B

    UserA->>ClientA: Открытие приложения
    ClientA->>ClientA: useSocket(userId) — создание соединения
    ClientA->>SocketA: connect
    SocketA->>Server: connection established
    
    ClientA->>SocketA: register(userId)
    SocketA->>Server: userSockets.set(userId, socketId)
    Server->>Server: socket.join("user:{userId}")
    
    loop every 30 seconds
        ClientA->>SocketA: online:heartbeat(userId)
        SocketA->>Server: Проверка: userId === socket.data.userId
        Server->>SocketB: broadcast emit("online:update", { userId, online: true })
        SocketB-->>ClientB: Показ зелёного кружка
    end
    
    UserA->>ClientA: Закрытие вкладки / отключение
    SocketA-->>Server: disconnect
    Server->>Server: userSockets.get(userId).delete(socketId)
    alt Больше нет активных сокетов для userId
        Server->>Server: userSockets.delete(userId)
        Server->>SocketB: broadcast emit("online:update", { userId, online: false })
        SocketB-->>ClientB: Скрытие зелёного кружка
    end
```

## 10. Реакция на сообщение

```mermaid
sequenceDiagram
    actor UserA as Пользователь A
    participant ClientA as Client A
    participant API as REST API
    participant DB as PostgreSQL

    UserA->>ClientA: Правый клик / тап на сообщении → выбор эмодзи "❤️"
    ClientA->>API: POST /api/messenger/messages/{messageId}/reactions { emoji: "❤️" }
    API->>API: auth() — проверка сессии
    API->>DB: prisma.messageReaction.findUnique({ where: { messageId_userId_emoji } })
    DB-->>API: existing reaction or null
    
    alt Реакция уже есть (анреакт)
        API->>DB: prisma.messageReaction.delete({ where: { id } })
        DB-->>API: deleted
        API-->>ClientA: { action: "removed" }
    else Новая реакция
        API->>DB: prisma.messageReaction.create({ data: { messageId, userId, emoji } })
        DB-->>API: reaction { id }
        API-->>ClientA: { action: "added" }
    end
    
    ClientA->>ClientA: toggleReaction(messageId, emoji, action)
```

## 11. Закрепление сообщения (Pin)

```mermaid
sequenceDiagram
    actor UserA as Пользователь A
    participant ClientA as Client A
    participant API as REST API
    participant DB as PostgreSQL

    UserA->>ClientA: Долгий тап / меню → "Закрепить"
    ClientA->>API: POST /api/messenger/conversations/{id}/pin { messageId }
    API->>API: auth() — проверка сессии
    
    API->>DB: prisma.pinnedMessage.findUnique({ where: { conversationId_messageId } })
    DB-->>API: existing pinned or null
    
    alt Уже закреплено (открепить)
        API->>DB: prisma.pinnedMessage.delete({ where: { id } })
        API-->>ClientA: { pinned: false }
    else Закрепить
        API->>DB: prisma.pinnedMessage.create({ data: { conversationId, messageId, pinnedById: userId } })
        DB-->>API: pinned
        API-->>ClientA: { pinned: true }
    end
    
    ClientA->>ClientA: togglePinnedMessage(messageId)
    ClientA->>ClientA: Обновление баннера закреплённых
```

## 12. Админ-панель: управление пользователями

```mermaid
sequenceDiagram
    actor Admin as Администратор
    participant Client as Admin Panel
    participant API as Route Handler
    participant DB as PostgreSQL

    Admin->>Client: Открытие /admin
    Client->>API: GET /api/admin/users
    API->>API: auth() — проверка сессии
    API->>API: Проверка роли: user.role === "admin"
    alt Не авторизован
        API-->>Client: 401
    else Не админ
        API-->>Client: 403
    else Админ
        API->>DB: prisma.user.findMany({ select: { id, username, role, emailEncrypted, createdAt } })
        DB-->>API: users[]
        API->>API: decrypt(emailEncrypted) для каждого пользователя
        API-->>Client: users[] с расшифрованными email
    end
    
    Admin->>Client: Редактирование пользователя
    Client->>API: PUT /api/admin/users/{id} { username?, role? }
    API->>API: auth(), role check
    API->>API: validate(updateUserSchema)
    API->>DB: prisma.user.update({ where: { id }, data: { username?, role? } })
    DB-->>API: updated
    API-->>Client: { success: true }
```

## 13. Загрузка и просмотр изображений

```mermaid
sequenceDiagram
    actor User as Пользователь
    participant Client as React Client
    participant API as Route Handler
    participant Disk as Filesystem

    User->>Client: Выбор файла (drag-n-drop / клик)
    Client->>Client: FormData { file }
    Client->>API: POST /api/upload
    API->>API: Проверка типа файла (image/*, video/*)
    API->>API: Генерация уникального имени
    API->>Disk: fs.writeFile("/uploads/{filename}", buffer)
    Disk-->>API: saved
    API-->>Client: { url: "/uploads/{filename}", type: "image/jpeg" }
    
    User->>Client: Создание поста с изображением
    Client->>Client: postForm { content, mediaUrl }
    
    Note over Client: Отображение
    Client->>API: GET /uploads/{filename}
    API->>Disk: fs.readFile / stream
    Disk-->>API: file buffer
    API-->>Client: image/png (Content-Type)
    Client->>Client: render <img src="/uploads/{filename}" />
```

## 14. Release Notes (заметки обновлений)

```mermaid
sequenceDiagram
    actor Admin as Администратор
    visitor User as Пользователь
    participant Client as React Client
    participant API as Route Handler
    participant DB as PostgreSQL

    Admin->>Client: Создание release note
    Client->>API: POST /api/admin/release-notes { title, content }
    API->>API: auth(), role === "admin"
    API->>API: validate(releaseNoteSchema)
    API->>DB: prisma.releaseNote.create({ data: { title, content } })
    DB-->>API: releaseNote { id, title, content, createdAt }
    API-->>Client: 201 { releaseNote }
    
    User->>Client: Открытие /updates
    Client->>API: GET /api/release-notes
    API->>DB: prisma.releaseNote.findMany({ orderBy: { createdAt: "desc" } })
    DB-->>API: releaseNotes[]
    API-->>Client: releaseNotes[]

    Admin->>Client: Редактирование
    Client->>API: PUT /api/admin/release-notes/{id} { title, content }
    API->>DB: prisma.releaseNote.update({ where: { id }, data: { title, content } })
    DB-->>API: updated
    API-->>Client: { releaseNote }
```

## 15. Блокировка пользователя (мессенджер)

```mermaid
sequenceDiagram
    actor UserA as Пользователь A
    participant Client as React Client
    participant API as Route Handler
    participant DB as PostgreSQL

    UserA->>Client: Меню пользователя → "Заблокировать"
    Client->>API: POST /api/messenger/block { userId: "userB-id" }
    API->>API: auth() — проверка сессии
    API->>API: validate(blockUserSchema)
    
    API->>DB: prisma.userBlock.findUnique({ where: { blockerId_blockedId } })
    DB-->>API: existing block or null
    
    alt Уже заблокирован (разблокировать)
        API->>DB: prisma.userBlock.delete({ where: { id } })
        DB-->>API: deleted
        API-->>Client: { blocked: false }
    else Заблокировать
        API->>DB: prisma.userBlock.create({ data: { blockerId, blockedId } })
        DB-->>API: block created
        API-->>Client: { blocked: true }
    end
    
    Client->>Client: Обновление UI
    Note over Client: Заблокированный пользователь:<br/>- не видит сообщения от блокирующего<br/>- не может писать в общий чат