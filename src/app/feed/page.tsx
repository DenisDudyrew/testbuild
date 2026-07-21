"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useState, useEffect, useRef, Suspense } from "react";
import { Heart, MessageCircle, Repeat2, Image as ImageIcon, LogOut, Search, Wind, Edit2, X, Trash2, Paperclip } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import ViewTracker from "@/components/ViewTracker";
import { useToast } from "@/components/ToastProvider";
import Sidebar from "@/components/Sidebar";
import RepostModal from "@/components/RepostModal";

interface Post {
  id: string;
  content: string;
  mediaUrl: string | null;
  mediaType: string | null;
  createdAt: string;
  views: number;
  user: {
    id: string;
    username: string;
    avatar: string | null;
  };
  likes: Array<{
    userId: string;
  }>;
  _count?: {
    likes: number;
    comments: number;
    reposts?: number;
  };
  repostOf?: {
    id: string;
    content: string;
    mediaUrl: string | null;
    mediaType: string | null;
    createdAt: string;
    user: {
      id: string;
      username: string;
      avatar: string | null;
    };
    likes: Array<{ userId: string }>;
    _count?: {
      likes: number;
      comments: number;
      reposts?: number;
    };
  } | null;
}

export default function FeedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-50">
        <div className="pl-60">
          <div className="mx-auto max-w-2xl min-[1600px]:max-w-3xl px-4 py-6">
            <div className="flex items-center justify-center py-16">
              <div className="size-8 animate-spin rounded-full border-3 border-zinc-200 border-t-indigo-600" />
            </div>
          </div>
        </div>
      </div>
    }>
      <FeedContent />
    </Suspense>
  );
}

function FeedContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [posts, setPosts] = useState<Post[]>([]);
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);
  const [highlightCommentId, setHighlightCommentId] = useState<string | null>(null);
  const [newPostContent, setNewPostContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [showAllComments, setShowAllComments] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<Record<string, any[]>>({});
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [replyingTo, setReplyingTo] = useState<{ commentId: string; username: string } | null>(null);
  const [viewedPosts, setViewedPosts] = useState<Set<string>>(new Set());
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [repostPost, setRepostPost] = useState<Post | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast, showConfirm, showAlert } = useToast();

  // Обработка query-параметров (переход из уведомлений)
  useEffect(() => {
    const postId = searchParams.get('postId');
    if (postId) {
      setHighlightPostId(postId);
      setExpandedComments(prev => new Set(prev).add(postId));
      // Сразу загружаем комментарии, если ещё не загружены
      if (!comments[postId]) {
        fetch(`/api/posts/${postId}/comments`).then(r => r.ok && r.json()).then(data => {
          if (data) setComments(prev => ({ ...prev, [postId]: data }));
        }).catch(() => {});
      }
    }
    setHighlightCommentId(searchParams.get('commentId'));
  }, [searchParams]);

  // Скролл к выделенному посту после загрузки
  useEffect(() => {
    if (highlightPostId && posts.length > 0) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`post-${highlightPostId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [highlightPostId, posts]);

  // Загрузка постов
  useEffect(() => {
    if (session) {
      loadPosts();
    }
  }, [session]);

  const loadPosts = async () => {
    try {
      const response = await fetch('/api/posts');
      if (response.ok) {
        const data = await response.json();
        setPosts(data);
        // Сбрасываем просмотренные посты при перезагрузке
        setViewedPosts(new Set());
        // Set liked posts
        const userId = session?.user?.id;
        if (userId) {
          const liked = new Set<string>(
            data
              .filter((post: Post) => post.likes.some((like) => like.userId === userId))
              .map((post: Post) => post.id)
          );
          setLikedPosts(liked);
        }
      }
    } catch (error) {
      console.error('Failed to load posts:', error);
    }
  };

  const handleSearch = async (query: string) => {
    try {
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data);
        setShowSearchResults(true);
      }
    } catch (error) {
      console.error('Failed to search users:', error);
    }
  };

  const handleLike = async (postId: string) => {
    try {
      const response = await fetch(`/api/posts/${postId}/like`, {
        method: 'POST',
      });
      if (response.ok) {
        const data = await response.json();
        setLikedPosts((prev) => {
          const newSet = new Set(prev);
          if (data.liked) {
            newSet.add(postId);
          } else {
            newSet.delete(postId);
          }
          return newSet;
        });
        // Reload posts to update like count
        await loadPosts();
      }
    } catch (error) {
      console.error('Failed to toggle like:', error);
    }
  };

  const handleToggleComments = async (postId: string) => {
    const newExpanded = new Set(expandedComments);
    if (newExpanded.has(postId)) {
      newExpanded.delete(postId);
      setExpandedComments(newExpanded);
    } else {
      newExpanded.add(postId);
      setExpandedComments(newExpanded);
      // Load comments if not already loaded
      if (!comments[postId]) {
        try {
          const response = await fetch(`/api/posts/${postId}/comments`);
          if (response.ok) {
            const data = await response.json();
            setComments((prev) => ({ ...prev, [postId]: data }));
          }
        } catch (error) {
          console.error('Failed to load comments:', error);
        }
      }
    }
  };

  const handleAddComment = async (postId: string, content: string, parentId?: string) => {
    if (!content.trim()) return;
    try {
      const response = await fetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, parentId }),
      });
      if (response.ok) {
        const data = await response.json();
        setComments((prev) => {
          const currentComments = prev[postId] || [];
          if (parentId) {
            // Ищем родительский комментарий и добавляем ответ в его replies
            const updatedComments = currentComments.map((comment: any) => {
              if (comment.id === parentId) {
                return {
                  ...comment,
                  replies: [...(comment.replies || []), data],
                };
              }
              // Если ответили на вложенный комментарий — ищем его среди replies
              if (comment.replies?.some((r: any) => r.id === parentId)) {
                return {
                  ...comment,
                  replies: [...comment.replies, data],
                };
              }
              return comment;
            });
            return { ...prev, [postId]: updatedComments };
          } else {
            return { ...prev, [postId]: [...currentComments, data] };
          }
        });
        await loadPosts();
        setReplyingTo(null);
      }
    } catch (error) {
      console.error('Failed to add comment:', error);
    }
  };

  const handleEditPost = async (postId: string) => {
    if (!editContent.trim()) return;
    try {
      const response = await fetch(`/api/posts/${postId}/edit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      });
      if (response.ok) {
        await loadPosts();
        setEditingPost(null);
        setEditContent("");
      } else {
        const data = await response.json();
        showAlert(data.error || 'Failed to edit post');
      }
    } catch (error) {
      console.error('Failed to edit post:', error);
    }
  };

  const handleDeletePost = async (postId: string) => {
    const confirmed = await showConfirm('Вы уверены, что хотите удалить этот пост?');
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/posts/${postId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        await loadPosts();
      }
    } catch (error) {
      console.error('Failed to delete post:', error);
    }
  };

  const canEditPost = (post: Post) => {
    if (post.user.id !== session?.user?.id) return false;
    const tenMinutesInMs = 10 * 60 * 1000;
    const timeSinceCreation = Date.now() - new Date(post.createdAt).getTime();
    return timeSinceCreation < tenMinutesInMs;
  };

  const canDeletePost = (post: Post) => {
    return post.user.id === session?.user?.id;
  };

  // Создание поста
  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostContent.trim() && !mediaFile) return;

    setIsLoading(true);
    try {
      let mediaUrl: string | null = null;
      let mediaType: string | null = null;

      // Загружаем медиа, если выбран файл
      if (mediaFile) {
        setIsUploading(true);
        const uploadFormData = new FormData();
        uploadFormData.append('file', mediaFile);
        
        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: uploadFormData,
        });

        if (!uploadResponse.ok) {
          const err = await uploadResponse.json();
          showAlert(err.error || 'Ошибка загрузки файла');
          setIsLoading(false);
          setIsUploading(false);
          return;
        }

        const uploadData = await uploadResponse.json();
        mediaUrl = uploadData.mediaUrl;
        mediaType = uploadData.mediaType;
        setIsUploading(false);
      }

      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newPostContent,
          mediaUrl,
          mediaType,
        }),
      });

      if (response.ok) {
        setNewPostContent("");
        setMediaFile(null);
        setMediaPreview(null);
        await loadPosts();
      }
    } catch (error) {
      console.error('Failed to create post:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Проверка размера (10 MB)
    if (file.size > 10 * 1024 * 1024) {
      showAlert('Файл слишком большой. Максимум 10 MB');
      return;
    }

    // Проверка типа
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm'];
    if (!allowedTypes.includes(file.type)) {
      showAlert('Неподдерживаемый формат. Разрешены: JPEG, PNG, GIF, WebP, MP4, WebM');
      return;
    }

    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const handleRemoveMedia = () => {
    setMediaFile(null);
    if (mediaPreview) {
      URL.revokeObjectURL(mediaPreview);
      setMediaPreview(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="text-zinc-500">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Sidebar />

      <div className="pl-60">
        <main className="mx-auto max-w-2xl min-[1600px]:max-w-3xl px-4 py-6">
        {/* Создание поста */}
        <form onSubmit={handleCreatePost} className="mb-8 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <textarea
            value={newPostContent}
            onChange={(e) => setNewPostContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                handleCreatePost(e);
              }
            }}
            placeholder="Что нового?"
            className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-zinc-400"
            rows={3}
            maxLength={1000}
          />
          
          {/* Превью медиа */}
          {mediaPreview && (
            <div className="relative mt-3 overflow-hidden rounded-xl">
              {mediaFile?.type.startsWith('video/') ? (
                <video src={mediaPreview} className="w-full max-h-64 object-cover" />
              ) : (
                <img src={mediaPreview} alt="Preview" className="w-full max-h-64 object-cover" />
              )}
              <button
                type="button"
                onClick={handleRemoveMedia}
                className="absolute top-2 right-2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-3">
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs hover:bg-zinc-100 ${
                  mediaFile ? 'text-indigo-600' : 'text-zinc-500'
                }`}
              >
                <Paperclip className="size-4" />
                {mediaFile ? mediaFile.name : 'Медиа'}
              </button>
            </div>
            <button
              type="submit"
              disabled={isLoading || isUploading || (!newPostContent.trim() && !mediaFile)}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isUploading ? "Загрузка..." : isLoading ? "Публикация..." : "Опубликовать"}
            </button>
          </div>
        </form>

        {/* Лента постов */}
        <div className="space-y-4">
          {posts.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-zinc-500">
              Пока нет постов. Будь первым!
            </div>
          ) : (
            posts.map((post) => (
              <article key={post.id} id={`post-${post.id}`} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  {post.user.avatar ? (
                    <img
                      src={post.user.avatar}
                      alt={post.user.username}
                      className="size-10 shrink-0 rounded-full object-cover cursor-pointer"
                      onClick={() => router.push(`/profile/${post.user.id}`)}
                    />
                  ) : (
                    <div
                      className="size-10 shrink-0 rounded-full bg-zinc-200 cursor-pointer"
                      onClick={() => router.push(`/profile/${post.user.id}`)}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span 
                        className="truncate text-sm font-semibold text-zinc-900 cursor-pointer hover:text-indigo-600"
                        onClick={() => router.push(`/profile/${post.user.id}`)}
                      >
                        {post.user.username}
                      </span>
                      <span className="font-mono text-xs text-zinc-400">
                        {new Date(post.createdAt).toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </span>
                      <span className="text-xs text-zinc-400">• {post.views} просмотров</span>
                      {canEditPost(post) && editingPost !== post.id && (
                        <button
                          onClick={() => {
                            setEditingPost(post.id);
                            setEditContent(post.content);
                          }}
                          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-indigo-600"
                        >
                          <Edit2 className="size-3" />
                          Редактировать
                        </button>
                      )}
                      {canDeletePost(post) && (
                        <button
                          onClick={() => handleDeletePost(post.id)}
                          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-red-600"
                        >
                          <Trash2 className="size-3" />
                          Удалить
                        </button>
                      )}
                    </div>
                    {editingPost === post.id ? (
                      <div className="mt-2">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                          rows={3}
                          maxLength={1000}
                        />
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => handleEditPost(post.id)}
                            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                          >
                            Сохранить
                          </button>
                          <button
                            onClick={() => {
                              setEditingPost(null);
                              setEditContent("");
                            }}
                            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                          >
                            <X className="size-3 inline" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1.5 text-sm text-zinc-700">{post.content}</p>
                    )}
                    
                    {post.mediaUrl && (
                      <div className="mt-3 overflow-hidden rounded-xl">
                        {post.mediaType === 'image' ? (
                          <img src={post.mediaUrl} alt="Post media" className="w-full" />
                        ) : post.mediaType === 'video' || post.mediaType === 'circle' ? (
                          <video src={post.mediaUrl} controls className="w-full" />
                        ) : null}
                      </div>
                    )}

                    {post.repostOf && (
                      <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="flex items-center gap-2">
                          <Repeat2 className="size-3 text-zinc-400" />
                          <span className="text-xs text-zinc-500">Репост</span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          {post.repostOf.user.avatar ? (
                            <img
                              src={post.repostOf.user.avatar}
                              alt={post.repostOf.user.username}
                              className="size-5 rounded-full object-cover"
                            />
                          ) : (
                            <div className="size-5 rounded-full bg-zinc-300" />
                          )}
                          <span
                            className="text-xs font-semibold text-zinc-900 cursor-pointer hover:text-indigo-600"
                            onClick={() => {
                              if (post.repostOf) router.push(`/profile/${post.repostOf.user.id}`);
                            }}
                          >
                            {post.repostOf.user.username}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-zinc-700">{post.repostOf.content}</p>
                        {post.repostOf.mediaUrl && (
                          <div className="mt-2 overflow-hidden rounded-lg">
                            {post.repostOf.mediaType === 'image' ? (
                              <img src={post.repostOf.mediaUrl} alt="Media" className="w-full max-h-48 object-cover" />
                            ) : (
                              <video src={post.repostOf.mediaUrl} controls className="w-full max-h-48" />
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <ViewTracker 
                      postId={post.id} 
                      viewedPosts={viewedPosts}
                      setViewedPosts={setViewedPosts}
                    />

                    <div className="mt-4 flex items-center gap-6">
                      <button 
                        onClick={() => handleLike(post.id)}
                        className={`flex items-center gap-1.5 text-xs ${
                          likedPosts.has(post.id) ? 'text-rose-500' : 'text-zinc-400 hover:text-rose-500'
                        }`}
                      >
                        <Heart className={`size-4 ${likedPosts.has(post.id) ? 'fill-current' : ''}`} />
                        {post.likes.length}
                      </button>
                      <button 
                        onClick={() => handleToggleComments(post.id)}
                        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-indigo-600"
                      >
                        <MessageCircle className="size-4" />
                        {post._count?.comments || 0}
                      </button>
                      <button 
                        onClick={() => setRepostPost(post)}
                        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-green-600"
                      >
                        <Repeat2 className="size-4" />
                        {post._count?.reposts || 0}
                      </button>
                    </div>

                    {expandedComments.has(post.id) && (
                      <div className="mt-4 border-t border-zinc-100 pt-4">
                        <div className="space-y-3">
                          {(showAllComments.has(post.id)
                            ? comments[post.id]
                            : comments[post.id]?.slice(0, 5)
                          )?.map((comment: any) => (
                            <div key={comment.id} className="flex gap-2">
                              {comment.user.avatar ? (
                                <img src={comment.user.avatar} alt={comment.user.username} className="size-6 shrink-0 rounded-full object-cover" />
                              ) : (
                                <div className="size-6 shrink-0 rounded-full bg-zinc-200" />
                              )}
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-zinc-900">{comment.user.username}</span>
                                  <span className="text-xs text-zinc-400">
                                    {new Date(comment.createdAt).toLocaleTimeString([], { 
                                      hour: '2-digit', 
                                      minute: '2-digit' 
                                    })}
                                  </span>
                                </div>
                                <p className="text-xs text-zinc-700">{comment.content}</p>
                                <button
                                  onClick={() => setReplyingTo({ commentId: comment.id, username: comment.user.username })}
                                  className="mt-1 text-xs text-indigo-600 hover:text-indigo-700"
                                >
                                  Ответить
                                </button>
                                {comment.replies && comment.replies.length > 0 && (
                                  <div className="ml-4 mt-2 space-y-2">
                                    {comment.replies.map((reply: any) => (
                                      <div key={reply.id} className="flex gap-2">
                                        {reply.user.avatar ? (
                                          <img src={reply.user.avatar} alt={reply.user.username} className="size-5 shrink-0 rounded-full object-cover" />
                                        ) : (
                                          <div className="size-5 shrink-0 rounded-full bg-zinc-200" />
                                        )}
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs font-semibold text-zinc-900">{reply.user.username}</span>
                                            <span className="text-xs text-zinc-400">
                                              {new Date(reply.createdAt).toLocaleTimeString([], { 
                                                hour: '2-digit', 
                                                minute: '2-digit' 
                                              })}
                                            </span>
                                          </div>
                                          <p className="text-xs text-zinc-700">{reply.content}</p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        {comments[post.id] && comments[post.id].length > 5 && (
                          <button
                            onClick={() => {
                              const newSet = new Set(showAllComments);
                              if (newSet.has(post.id)) {
                                newSet.delete(post.id);
                              } else {
                                newSet.add(post.id);
                              }
                              setShowAllComments(newSet);
                            }}
                            className="mt-2 text-xs text-indigo-600 hover:text-indigo-700"
                          >
                            {showAllComments.has(post.id)
                              ? `Скрыть ${comments[post.id].length - 5} комментариев`
                              : `Показать ещё ${comments[post.id].length - 5} комментариев`}
                          </button>
                        )}
                        <CommentForm 
                          postId={post.id} 
                          onAddComment={handleAddComment}
                          replyingTo={replyingTo}
                          onCancelReply={() => setReplyingTo(null)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
        </main>
      </div>

      {repostPost && (
        <RepostModal
          post={repostPost}
          onClose={() => setRepostPost(null)}
          onReposted={loadPosts}
        />
      )}
    </div>
  );
}

function CommentForm({ 
  postId, 
  onAddComment, 
  replyingTo,
  onCancelReply 
}: { 
  postId: string; 
  onAddComment: (postId: string, content: string, parentId?: string) => void;
  replyingTo: { commentId: string; username: string } | null;
  onCancelReply: () => void;
}) {
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setIsSubmitting(true);
    onAddComment(postId, comment, replyingTo?.commentId);
    setComment("");
    setIsSubmitting(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3">
      {replyingTo && (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2">
          <span className="text-xs text-zinc-600">
            Ответ на <span className="font-semibold">{replyingTo.username}</span>
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            className="text-xs text-zinc-400 hover:text-zinc-600"
          >
            <X className="size-3" />
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={replyingTo ? `Ответить ${replyingTo.username}...` : "Написать комментарий..."}
          className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={isSubmitting || !comment.trim()}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isSubmitting ? "..." : "Отправить"}
        </button>
      </div>
    </form>
  );
}
