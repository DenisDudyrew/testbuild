import { describe, it, expect, beforeEach } from 'vitest';
import { mockPrisma, mockAuth, resetMocks, setAuthSession, createJsonRequest, createGetRequest } from './helpers';

// API login route
describe('POST /api/login', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('returns 400 if username or password missing', async () => {
    const { POST } = await import('@/app/api/login/route');

    const res = await POST(createJsonRequest('http://localhost:3000/api/login', {}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('required');
  });

  it('returns 401 if user not found', async () => {
    const { POST } = await import('@/app/api/login/route');
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await POST(createJsonRequest('http://localhost:3000/api/login', {
      username: 'nonexistent',
      password: 'password123',
    }));
    expect(res.status).toBe(401);
  });

  it('returns 401 if password is wrong', async () => {
    const { POST } = await import('@/app/api/login/route');
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'testuser',
      password: '$2a$10$hashedpassword',
      avatar: null,
      header: null,
    });

    const res = await POST(createJsonRequest('http://localhost:3000/api/login', {
      username: 'testuser',
      password: 'wrongpassword',
    }));
    expect(res.status).toBe(401);
  });

  it('returns user data on successful login', async () => {
    const { POST } = await import('@/app/api/login/route');
    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash('correctpassword', 10);

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'testuser',
      password: hashedPassword,
      avatar: 'avatar.jpg',
      header: 'header.jpg',
    });

    const res = await POST(createJsonRequest('http://localhost:3000/api/login', {
      username: 'testuser',
      password: 'correctpassword',
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.username).toBe('testuser');
  });
});

describe('POST /api/register', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('returns 400 if validation fails', async () => {
    const { POST } = await import('@/app/api/register/route');

    const res = await POST(createJsonRequest('http://localhost:3000/api/register', {
      username: 'ab',
      password: '123',
      email: 'invalid',
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 if pending user not found', async () => {
    const { POST } = await import('@/app/api/register/route');

    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await POST(createJsonRequest('http://localhost:3000/api/register', {
      username: 'testuser',
      password: 'password123',
      email: 'test@example.com',
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('email');
  });

  it('returns 400 if email not verified', async () => {
    const { POST } = await import('@/app/api/register/route');

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      emailVerified: false,
    });

    const res = await POST(createJsonRequest('http://localhost:3000/api/register', {
      username: 'testuser',
      password: 'password123',
      email: 'test@example.com',
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('подтвержд');
  });

  it('returns 409 if username already exists', async () => {
    const { POST } = await import('@/app/api/register/route');

    // First call returns verified user, second call returns existing username
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        emailVerified: true,
      })
      .mockResolvedValueOnce({
        id: 'user-2',
        username: 'testuser',
      });

    const res = await POST(createJsonRequest('http://localhost:3000/api/register', {
      username: 'testuser',
      password: 'password123',
      email: 'test@example.com',
    }));
    expect(res.status).toBe(409);
  });

  it('returns 201 on successful registration', async () => {
    const { POST } = await import('@/app/api/register/route');

    mockPrisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        emailVerified: true,
      })
      .mockResolvedValueOnce(null);

    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      username: 'testuser',
      avatar: null,
      header: null,
      createdAt: new Date().toISOString(),
    });

    const res = await POST(createJsonRequest('http://localhost:3000/api/register', {
      username: 'testuser',
      password: 'password123',
      email: 'test@example.com',
    }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.username).toBe('testuser');
  });
});

describe('GET /api/posts', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('returns posts with pagination', async () => {
    const { GET } = await import('@/app/api/posts/route');

    const mockPosts = [
      {
        id: 'post-1',
        content: 'Hello world',
        userId: 'user-1',
        createdAt: new Date(),
        user: { id: 'user-1', username: 'testuser', avatar: null },
        likes: [],
        repostOf: null,
        repostedComment: null,
        _count: { likes: 0, comments: 0, reposts: 0 },
      },
    ];

    mockPrisma.post.findMany.mockResolvedValue(mockPosts);
    mockPrisma.post.count.mockResolvedValue(1);

    const res = createGetRequest('http://localhost:3000/api/posts?page=1&limit=10');
    const response = await GET(res);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.posts).toHaveLength(1);
    expect(data.total).toBe(1);
    expect(data.page).toBe(1);
  });

  it('returns empty array when no posts', async () => {
    const { GET } = await import('@/app/api/posts/route');

    mockPrisma.post.findMany.mockResolvedValue([]);
    mockPrisma.post.count.mockResolvedValue(0);

    const res = createGetRequest('http://localhost:3000/api/posts');
    const response = await GET(res);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.posts).toHaveLength(0);
    expect(data.total).toBe(0);
  });
});

describe('POST /api/posts', () => {
  beforeEach(() => {
    resetMocks();
    setAuthSession('user-1');
  });

  it('returns 401 if not authenticated', async () => {
    setAuthSession(null);
    const { POST } = await import('@/app/api/posts/route');

    const res = await POST(createJsonRequest('http://localhost:3000/api/posts', {
      content: 'My new post',
    }));
    expect(res.status).toBe(401);
  });

  it('returns 400 if validation fails', async () => {
    const { POST } = await import('@/app/api/posts/route');

    const res = await POST(createJsonRequest('http://localhost:3000/api/posts', {
      content: 'a'.repeat(1001),
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 if no content and no media', async () => {
    const { POST } = await import('@/app/api/posts/route');

    const res = await POST(createJsonRequest('http://localhost:3000/api/posts', {
      content: '',
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('content or media');
  });

  it('returns 201 on successful post creation', async () => {
    const { POST } = await import('@/app/api/posts/route');

    mockPrisma.post.create.mockResolvedValue({
      id: 'post-1',
      content: 'My new post',
      userId: 'user-1',
      mediaUrl: null,
      mediaType: null,
      createdAt: new Date().toISOString(),
      user: { username: 'testuser', avatar: null },
    });

    const res = await POST(createJsonRequest('http://localhost:3000/api/posts', {
      content: 'My new post',
    }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.content).toBe('My new post');
  });
});

describe('GET /api/posts/[id]', () => {
  beforeEach(() => {
    resetMocks();
    setAuthSession('user-1');
  });

  it('returns 401 if not authenticated', async () => {
    setAuthSession(null);
    const { GET } = await import('@/app/api/posts/[id]/route');

    const res = await GET(createGetRequest('http://localhost:3000/api/posts/post-1'), {
      params: Promise.resolve({ id: 'post-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 if post not found', async () => {
    const { GET } = await import('@/app/api/posts/[id]/route');

    mockPrisma.post.findUnique.mockResolvedValue(null);

    const res = await GET(createGetRequest('http://localhost:3000/api/posts/post-1'), {
      params: Promise.resolve({ id: 'post-1' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns post data', async () => {
    const { GET } = await import('@/app/api/posts/[id]/route');

    const mockPost = {
      id: 'post-1',
      content: 'Test post',
      userId: 'user-1',
      views: 5,
      createdAt: new Date(),
      user: { id: 'user-1', username: 'testuser', avatar: null },
      likes: [],
      repostOf: null,
      repostedComment: null,
      _count: { likes: 0, comments: 0, reposts: 0 },
    };

    mockPrisma.post.findUnique.mockResolvedValue(mockPost);

    const res = await GET(createGetRequest('http://localhost:3000/api/posts/post-1'), {
      params: Promise.resolve({ id: 'post-1' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe('post-1');
    expect(data.content).toBe('Test post');
  });
});

describe('DELETE /api/posts/[id]', () => {
  beforeEach(() => {
    resetMocks();
    setAuthSession('user-1');
  });

  it('returns 401 if not authenticated', async () => {
    setAuthSession(null);
    const { DELETE } = await import('@/app/api/posts/[id]/route');

    const res = await DELETE(createGetRequest('http://localhost:3000/api/posts/post-1'), {
      params: Promise.resolve({ id: 'post-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 if post not found', async () => {
    const { DELETE } = await import('@/app/api/posts/[id]/route');

    mockPrisma.post.findUnique.mockResolvedValue(null);

    const res = await DELETE(createGetRequest('http://localhost:3000/api/posts/post-1'), {
      params: Promise.resolve({ id: 'post-1' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 403 if user is not owner and not admin', async () => {
    const { DELETE } = await import('@/app/api/posts/[id]/route');

    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      userId: 'other-user',
    });
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'user' });

    const res = await DELETE(createGetRequest('http://localhost:3000/api/posts/post-1'), {
      params: Promise.resolve({ id: 'post-1' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 200 on successful deletion by owner', async () => {
    const { DELETE } = await import('@/app/api/posts/[id]/route');

    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      userId: 'user-1',
    });

    const res = await DELETE(createGetRequest('http://localhost:3000/api/posts/post-1'), {
      params: Promise.resolve({ id: 'post-1' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('returns 200 on successful deletion by admin', async () => {
    const { DELETE } = await import('@/app/api/posts/[id]/route');

    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      userId: 'other-user',
    });
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'admin' });

    const res = await DELETE(createGetRequest('http://localhost:3000/api/posts/post-1'), {
      params: Promise.resolve({ id: 'post-1' }),
    });
    expect(res.status).toBe(200);
  });
});

describe('GET /api/users/search', () => {
  beforeEach(() => {
    resetMocks();
    setAuthSession('user-1');
  });

  it('returns 401 if not authenticated', async () => {
    setAuthSession(null);
    const { GET } = await import('@/app/api/users/search/route');

    const res = await GET(createGetRequest('http://localhost:3000/api/users/search?q=test'));
    expect(res.status).toBe(401);
  });

  it('returns users matching query', async () => {
    const { GET } = await import('@/app/api/users/search/route');

    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'user-1', username: 'testuser', avatar: null, bio: 'Hello' },
      { id: 'user-2', username: 'testuser2', avatar: null, bio: 'World' },
    ]);

    const res = await GET(createGetRequest('http://localhost:3000/api/users/search?q=test'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(2);
    expect(data[0].username).toBe('testuser');
  });

  it('returns all users when no query', async () => {
    const { GET } = await import('@/app/api/users/search/route');

    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'user-1', username: 'alice', avatar: null, bio: null },
      { id: 'user-2', username: 'bob', avatar: null, bio: null },
    ]);

    const res = await GET(createGetRequest('http://localhost:3000/api/users/search'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(2);
  });
});

describe('GET /api/notifications', () => {
  beforeEach(() => {
    resetMocks();
    setAuthSession('user-1');
  });

  it('returns 401 if not authenticated', async () => {
    setAuthSession(null);
    const { GET } = await import('@/app/api/notifications/route');

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns notifications and unread count', async () => {
    const { GET } = await import('@/app/api/notifications/route');

    mockPrisma.notification.findMany.mockResolvedValue([
      {
        id: 'notif-1',
        type: 'like',
        read: false,
        createdAt: new Date(),
        actor: { id: 'user-2', username: 'otheruser', avatar: null },
        post: { id: 'post-1', content: 'Test post' },
      },
    ]);
    mockPrisma.notification.count.mockResolvedValue(1);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.notifications).toHaveLength(1);
    expect(data.unreadCount).toBe(1);
  });

  it('returns empty array when no notifications', async () => {
    const { GET } = await import('@/app/api/notifications/route');

    mockPrisma.notification.findMany.mockResolvedValue([]);
    mockPrisma.notification.count.mockResolvedValue(0);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.notifications).toHaveLength(0);
    expect(data.unreadCount).toBe(0);
  });
});

