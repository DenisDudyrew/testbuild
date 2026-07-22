// Типы для постов, комментариев и связанных сущностей

export interface PostUser {
  id: string;
  username: string;
  avatar: string | null;
}

export interface PostCounts {
  likes: number;
  comments: number;
  reposts?: number;
}

export interface RepostedPost {
  id: string;
  content: string;
  mediaUrl: string | null;
  mediaType: string | null;
  createdAt: string;
  user: PostUser;
  likes: Array<{ userId: string }>;
  _count?: PostCounts;
}

export interface RepostedComment {
  id: string;
  content: string;
  createdAt: string;
  user: PostUser;
  likes: Array<{ userId: string }>;
  _count?: { likes: number };
  postId: string;
  post?: {
    id: string;
    content: string;
    mediaUrl: string | null;
    mediaType: string | null;
    createdAt: string;
    user: PostUser;
  } | null;
}

export interface Post {
  id: string;
  content: string;
  mediaUrl: string | null;
  mediaType: string | null;
  createdAt: string;
  views: number;
  user: PostUser;
  likes: Array<{ userId: string }>;
  _count?: PostCounts;
  repostOf?: RepostedPost | null;
  repostedComment?: RepostedComment | null;
}

export interface CommentUser {
  id: string;
  username: string;
  avatar: string | null;
}

export interface CommentReply {
  id: string;
  content: string;
  createdAt: string;
  user: CommentUser;
  likes: Array<{ userId: string }>;
  _count?: { likes: number };
}

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user: CommentUser;
  parentId: string | null;
  postId: string;
  likes: Array<{ userId: string }>;
  _count?: { likes: number };
  replies: CommentReply[];
  post?: {
    id: string;
    content: string;
    mediaUrl: string | null;
    mediaType: string | null;
    createdAt: string;
    user: PostUser;
  } | null;
}

export interface SearchUser {
  id: string;
  username: string;
  avatar: string | null;
}

export interface ApiError {
  error: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}
