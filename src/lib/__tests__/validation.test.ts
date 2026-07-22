import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  createPostSchema,
  createCommentSchema,
  updateProfileSchema,
  updateUserSchema,
  releaseNoteSchema,
  validate,
} from '../validation';

describe('registerSchema', () => {
  it('accepts valid registration data', () => {
    const result = registerSchema.safeParse({
      username: 'testuser',
      password: 'password123',
      email: 'test@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('rejects short username', () => {
    const result = registerSchema.safeParse({
      username: 'ab',
      password: 'password123',
      email: 'test@example.com',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('минимум 3');
    }
  });

  it('rejects username with special characters', () => {
    const result = registerSchema.safeParse({
      username: 'user name!',
      password: 'password123',
      email: 'test@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects short password', () => {
    const result = registerSchema.safeParse({
      username: 'testuser',
      password: '12345',
      email: 'test@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = registerSchema.safeParse({
      username: 'testuser',
      password: 'password123',
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('rejects too long username', () => {
    const result = registerSchema.safeParse({
      username: 'a'.repeat(31),
      password: 'password123',
      email: 'test@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects too long password', () => {
    const result = registerSchema.safeParse({
      username: 'testuser',
      password: 'a'.repeat(129),
      email: 'test@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('accepts username with underscores', () => {
    const result = registerSchema.safeParse({
      username: 'test_user_123',
      password: 'password123',
      email: 'test@example.com',
    });
    expect(result.success).toBe(true);
  });
});

describe('createPostSchema', () => {
  it('accepts valid post with content', () => {
    const result = createPostSchema.safeParse({
      content: 'Hello, world!',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty content with default', () => {
    const result = createPostSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toBe('');
    }
  });

  it('accepts post with media', () => {
    const result = createPostSchema.safeParse({
      content: 'Check this out',
      mediaUrl: 'https://example.com/image.jpg',
      mediaType: 'image',
    });
    expect(result.success).toBe(true);
  });

  it('rejects too long content', () => {
    const result = createPostSchema.safeParse({
      content: 'a'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid mediaType', () => {
    const result = createPostSchema.safeParse({
      content: 'test',
      mediaUrl: 'https://example.com/file.pdf',
      mediaType: 'document',
    });
    expect(result.success).toBe(false);
  });

  it('accepts nullable media fields', () => {
    const result = createPostSchema.safeParse({
      content: 'test',
      mediaUrl: null,
      mediaType: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('createCommentSchema', () => {
  it('accepts valid comment', () => {
    const result = createCommentSchema.safeParse({
      content: 'Nice post!',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty comment', () => {
    const result = createCommentSchema.safeParse({
      content: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects too long comment', () => {
    const result = createCommentSchema.safeParse({
      content: 'a'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it('accepts comment with parentId', () => {
    const result = createCommentSchema.safeParse({
      content: 'Reply to comment',
      parentId: 'some-comment-id',
    });
    expect(result.success).toBe(true);
  });

  it('accepts nullable parentId', () => {
    const result = createCommentSchema.safeParse({
      content: 'Top-level comment',
      parentId: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('updateProfileSchema', () => {
  it('accepts valid profile update', () => {
    const result = updateProfileSchema.safeParse({
      username: 'newusername',
      bio: 'Hello, I am new here!',
    });
    expect(result.success).toBe(true);
  });

  it('accepts partial update', () => {
    const result = updateProfileSchema.safeParse({
      bio: 'Just updating bio',
    });
    expect(result.success).toBe(true);
  });

  it('rejects too long bio', () => {
    const result = updateProfileSchema.safeParse({
      bio: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('accepts nullable avatar and header', () => {
    const result = updateProfileSchema.safeParse({
      avatar: null,
      header: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid username', () => {
    const result = updateProfileSchema.safeParse({
      username: 'us er',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateUserSchema', () => {
  it('accepts valid role update', () => {
    const result = updateUserSchema.safeParse({
      role: 'admin',
    });
    expect(result.success).toBe(true);
  });

  it('accepts username update', () => {
    const result = updateUserSchema.safeParse({
      username: 'newadmin',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid role', () => {
    const result = updateUserSchema.safeParse({
      role: 'superadmin',
    });
    expect(result.success).toBe(false);
  });

  it('accepts empty object (nothing to update)', () => {
    const result = updateUserSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('releaseNoteSchema', () => {
  it('accepts valid release note', () => {
    const result = releaseNoteSchema.safeParse({
      title: 'Version 1.0',
      content: 'Initial release with all features',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty title', () => {
    const result = releaseNoteSchema.safeParse({
      title: '',
      content: 'Some content',
    });
    expect(result.success).toBe(false);
  });

  it('rejects too long title', () => {
    const result = releaseNoteSchema.safeParse({
      title: 'a'.repeat(201),
      content: 'Some content',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty content', () => {
    const result = releaseNoteSchema.safeParse({
      title: 'Version 1.0',
      content: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('validate helper', () => {
  it('returns success with data on valid input', () => {
    const result = validate(registerSchema, {
      username: 'testuser',
      password: 'password123',
      email: 'test@example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.username).toBe('testuser');
    }
  });

  it('returns error message on invalid input', () => {
    const result = validate(registerSchema, {
      username: 'ab',
      password: '123',
      email: 'bad',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeTruthy();
      expect(typeof result.error).toBe('string');
    }
  });
});
