import { describe, it, expect, beforeEach } from 'vitest';
import { mockPrisma, resetMocks, setAuthSession } from './helpers';

describe('createPost (Server Action)', () => {
  beforeEach(() => {
    resetMocks();
    setAuthSession('user-1');
  });

  it('returns error if not authenticated', async () => {
    setAuthSession(null);
    const { createPost } = await import('@/lib/actions');

    const formData = new FormData();
    formData.set('content', 'Hello');

    const result = await createPost(formData);
    expect(result.error).toBe('Unauthorized');
  });

  it('returns error if validation fails', async () => {
    const { createPost } = await import('@/lib/actions');

    const formData = new FormData();
    formData.set('content', 'a'.repeat(1001));

    const result = await createPost(formData);
    expect(result.error).toBeTruthy();
  });

  it('returns error if no content and no media', async () => {
    const { createPost } = await import('@/lib/actions');

    const formData = new FormData();
    formData.set('content', '');

    const result = await createPost(formData);
    expect(result.error).toContain('content or media');
  });

  it('creates post successfully with hashtags', async () => {
    const { createPost } = await import('@/lib/actions');

    mockPrisma.hashtag.upsert.mockResolvedValue({ id: 'hashtag-1' });
    mockPrisma.post.create.mockResolvedValue({
      id: 'post-1',
      content: 'Hello #test',
      userId: 'user-1',
      mediaUrl: null,
      mediaType: null,
      createdAt: new Date().toISOString(),
      user: { username: 'testuser', avatar: null },
    });

    const formData = new FormData();
    formData.set('content', 'Hello #test');

    const result = await createPost(formData);
    expect(result.post?.id).toBe('post-1');
    expect(mockPrisma.hashtag.upsert).toHaveBeenCalledWith({
      where: { name: '#test' },
      update: {},
      create: { name: '#test' },
    });
  });

  it('creates post with media', async () => {
    const { createPost } = await import('@/lib/actions');

    mockPrisma.post.create.mockResolvedValue({
      id: 'post-2',
      content: 'Check this',
      userId: 'user-1',
      mediaUrl: '/uploads/img.jpg',
      mediaType: 'image',
      createdAt: new Date().toISOString(),
      user: { username: 'testuser', avatar: null },
    });

    const formData = new FormData();
    formData.set('content', 'Check this');
    formData.set('mediaUrl', '/uploads/img.jpg');
    formData.set('mediaType', 'image');

    const result = await createPost(formData);
    expect(result.post?.id).toBe('post-2');
    expect(result.post?.mediaUrl).toBe('/uploads/img.jpg');
  });
});

describe('deletePost (Server Action)', () => {
  beforeEach(() => {
    resetMocks();
    setAuthSession('user-1');
  });

  it('returns error if not authenticated', async () => {
    setAuthSession(null);
    const { deletePost } = await import('@/lib/actions');

    const result = await deletePost('post-1');
    expect(result.error).toBe('Unauthorized');
  });

  it('returns error if post not found or not owned', async () => {
    const { deletePost } = await import('@/lib/actions');

    mockPrisma.post.findUnique.mockResolvedValue(null);

    const result = await deletePost('post-1');
    expect(result.error).toBe('Forbidden');
  });

  it('returns error if not the owner', async () => {
    const { deletePost } = await import('@/lib/actions');

    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      userId: 'other-user',
    });

    const result = await deletePost('post-1');
    expect(result.error).toBe('Forbidden');
  });

  it('deletes post successfully', async () => {
    const { deletePost } = await import('@/lib/actions');

    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      userId: 'user-1',
    });

    const result = await deletePost('post-1');
    expect(result.success).toBe(true);
    expect(mockPrisma.post.delete).toHaveBeenCalledWith({
      where: { id: 'post-1' },
    });
  });
});

describe('editPost (Server Action)', () => {
  beforeEach(() => {
    resetMocks();
    setAuthSession('user-1');
  });

  it('returns error if not authenticated', async () => {
    setAuthSession(null);
    const { editPost } = await import('@/lib/actions');

    const result = await editPost('post-1', 'Updated content');
    expect(result.error).toBe('Unauthorized');
  });

  it('returns error if post not found or not owned', async () => {
    const { editPost } = await import('@/lib/actions');

    mockPrisma.post.findUnique.mockResolvedValue(null);

    const result = await editPost('post-1', 'Updated content');
    expect(result.error).toBe('Forbidden');
  });

  it('edits post successfully', async () => {
    const { editPost } = await import('@/lib/actions');

    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      userId: 'user-1',
    });

    const result = await editPost('post-1', 'Updated content');
    expect(result.success).toBe(true);
    expect(mockPrisma.post.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: { content: 'Updated content' },
    });
  });
});

describe('toggleLike (Server Action)', () => {
  beforeEach(() => {
    resetMocks();
    setAuthSession('user-1');
  });

  it('returns error if not authenticated', async () => {
    setAuthSession(null);
    const { toggleLike } = await import('@/lib/actions');

    const result = await toggleLike('post-1');
    expect(result.error).toBe('Unauthorized');
  });

  it('unlikes if already liked', async () => {
    const { toggleLike } = await import('@/lib/actions');

    mockPrisma.like.findUnique.mockResolvedValue({
      id: 'like-1',
      userId: 'user-1',
      postId: 'post-1',
    });

    const result = await toggleLike('post-1');
    expect(result.liked).toBe(false);
    expect(mockPrisma.like.delete).toHaveBeenCalled();
  });

  it('likes and creates notification for other user post', async () => {
    const { toggleLike } = await import('@/lib/actions');

    mockPrisma.like.findUnique.mockResolvedValue(null);
    mockPrisma.like.create.mockResolvedValue({ id: 'like-1' });
    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      userId: 'other-user',
    });

    const result = await toggleLike('post-1');
    expect(result.liked).toBe(true);
    expect(mockPrisma.notification.create).toHaveBeenCalled();
  });

  it('likes own post without notification', async () => {
    const { toggleLike } = await import('@/lib/actions');

    mockPrisma.like.findUnique.mockResolvedValue(null);
    mockPrisma.like.create.mockResolvedValue({ id: 'like-1' });
    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      userId: 'user-1', // own post
    });

    const result = await toggleLike('post-1');
    expect(result.liked).toBe(true);
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });
});

describe('addComment (Server Action)', () => {
  beforeEach(() => {
    resetMocks();
    setAuthSession('user-1');
  });

  it('returns error if not authenticated', async () => {
    setAuthSession(null);
    const { addComment } = await import('@/lib/actions');

    const result = await addComment('post-1', 'Nice post!');
    expect(result.error).toBe('Unauthorized');
  });

  it('returns error if content is empty', async () => {
    const { addComment } = await import('@/lib/actions');

    const result = await addComment('post-1', '   ');
    expect(result.error).toBe('Content is required');
  });

  it('creates comment successfully', async () => {
    const { addComment } = await import('@/lib/actions');

    mockPrisma.comment.create.mockResolvedValue({
      id: 'comment-1',
      content: 'Nice post!',
      userId: 'user-1',
      postId: 'post-1',
      parentId: null,
      user: { id: 'user-1', username: 'testuser', avatar: null },
    });
    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      userId: 'other-user',
    });

    const result = await addComment('post-1', 'Nice post!');
    expect(result.comment?.id).toBe('comment-1');
    expect(mockPrisma.notification.create).toHaveBeenCalled();
  });

  it('creates comment without notification on own post', async () => {
    const { addComment } = await import('@/lib/actions');

    mockPrisma.comment.create.mockResolvedValue({
      id: 'comment-1',
      content: 'Self comment',
      userId: 'user-1',
      postId: 'post-1',
      parentId: null,
      user: { id: 'user-1', username: 'testuser', avatar: null },
    });
    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      userId: 'user-1', // own post
    });

    const result = await addComment('post-1', 'Self comment');
    expect(result.comment?.id).toBe('comment-1');
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it('creates reply with parentId', async () => {
    const { addComment } = await import('@/lib/actions');

    mockPrisma.comment.create.mockResolvedValue({
      id: 'comment-2',
      content: 'Reply!',
      userId: 'user-1',
      postId: 'post-1',
      parentId: 'comment-1',
      user: { id: 'user-1', username: 'testuser', avatar: null },
    });
    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      userId: 'other-user',
    });

    const result = await addComment('post-1', 'Reply!', 'comment-1');
    expect(result.comment?.parentId).toBe('comment-1');
    expect(mockPrisma.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parentId: 'comment-1' }),
      })
    );
  });
});

describe('toggleFollow (Server Action)', () => {
  beforeEach(() => {
    resetMocks();
    setAuthSession('user-1');
  });

  it('returns error if not authenticated', async () => {
    setAuthSession(null);
    const { toggleFollow } = await import('@/lib/actions');

    const result = await toggleFollow('user-2');
    expect(result.error).toBe('Unauthorized');
  });

  it('returns error if trying to follow yourself', async () => {
    const { toggleFollow } = await import('@/lib/actions');

    const result = await toggleFollow('user-1');
    expect(result.error).toBe('Cannot follow yourself');
  });

  it('unfollows if already following', async () => {
    const { toggleFollow } = await import('@/lib/actions');

    mockPrisma.follow.findUnique.mockResolvedValue({
      id: 'follow-1',
      followerId: 'user-1',
      followingId: 'user-2',
    });

    const result = await toggleFollow('user-2');
    expect(result.followed).toBe(false);
    expect(mockPrisma.follow.delete).toHaveBeenCalled();
  });

  it('follows successfully', async () => {
    const { toggleFollow } = await import('@/lib/actions');

    mockPrisma.follow.findUnique.mockResolvedValue(null);

    const result = await toggleFollow('user-2');
    expect(result.followed).toBe(true);
    expect(mockPrisma.follow.create).toHaveBeenCalledWith({
      data: { followerId: 'user-1', followingId: 'user-2' },
    });
  });
});

describe('toggleBookmark (Server Action)', () => {
  beforeEach(() => {
    resetMocks();
    setAuthSession('user-1');
  });

  it('returns error if not authenticated', async () => {
    setAuthSession(null);
    const { toggleBookmark } = await import('@/lib/actions');

    const result = await toggleBookmark('post-1');
    expect(result.error).toBe('Unauthorized');
  });

  it('removes bookmark if already bookmarked', async () => {
    const { toggleBookmark } = await import('@/lib/actions');

    mockPrisma.bookmark.findUnique.mockResolvedValue({
      id: 'bookmark-1',
      userId: 'user-1',
      postId: 'post-1',
    });

    const result = await toggleBookmark('post-1');
    expect(result.bookmarked).toBe(false);
    expect(mockPrisma.bookmark.delete).toHaveBeenCalled();
  });

  it('bookmarks successfully', async () => {
    const { toggleBookmark } = await import('@/lib/actions');

    mockPrisma.bookmark.findUnique.mockResolvedValue(null);

    const result = await toggleBookmark('post-1');
    expect(result.bookmarked).toBe(true);
    expect(mockPrisma.bookmark.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', postId: 'post-1' },
    });
  });
});
