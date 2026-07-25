"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import type { Post, Comment, CommentReply } from "@/types/post";

export function usePosts() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);
  const [highlightCommentId, setHighlightCommentId] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [showAllComments, setShowAllComments] = useState<Set<string>>(new Set());
  const [viewedPosts, setViewedPosts] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalPosts, setTotalPosts] = useState(0);

  // Обработка query-параметров
  useEffect(() => {
    const postId = searchParams.get("postId");
    if (postId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHighlightPostId(postId);
      setExpandedComments((prev) => new Set(prev).add(postId));
      if (!comments[postId]) {
        fetch(`/api/posts/${postId}/comments`)
          .then((r) => r.ok && r.json())
          .then((data) => {
            if (data) setComments((prev) => ({ ...prev, [postId]: data }));
          })
          .catch(() => {});
      }
    }
    setHighlightCommentId(searchParams.get("commentId"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Скролл к выделенному посту
  useEffect(() => {
    if (highlightPostId && posts.length > 0) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`post-${highlightPostId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [highlightPostId, posts]);

  const loadPosts = useCallback(async (pageNum = 1, append = false) => {
    try {
      if (pageNum === 1) setIsLoadingMore(true);
      const response = await fetch(`/api/posts?page=${pageNum}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        const newPosts = data.posts || data;
        const total = data.total || data.length;

        if (append) {
          setPosts((prev) => [...prev, ...newPosts]);
        } else {
          setPosts(newPosts);
          setViewedPosts(new Set());
        }

        setTotalPosts(total);
        // Используем total для правильного hasMore: page * limit < total
        setHasMore(pageNum * 10 < total);

        // Устанавливаем лайкнутые посты
        const userId = session?.user?.id;
        if (userId) {
          const liked = new Set<string>(
            newPosts
              .filter((post: Post) => post.likes?.some((like) => like.userId === userId))
              .map((post: Post) => post.id)
          );
          if (append) {
            setLikedPosts((prev) => new Set([...prev, ...liked]));
          } else {
            setLikedPosts(liked);
          }
        }
      }
    } catch (error) {
      console.error("Failed to load posts:", error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [session]);

  useEffect(() => {
    if (session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadPosts(1);
    }
  }, [session, loadPosts]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    await loadPosts(nextPage, true);
  }, [page, isLoadingMore, hasMore, loadPosts]);

  const refreshPosts = useCallback(() => {
    setPage(1);
    loadPosts(1);
  }, [loadPosts]);

  const handleLike = useCallback(
    async (postId: string) => {
      try {
        const response = await fetch(`/api/posts/${postId}/like`, {
          method: "POST",
        });
        if (response.ok) {
          const data = await response.json();
          
          // Update likedPosts set for the heart animation toggle
          setLikedPosts((prev) => {
            const newSet = new Set(prev);
            if (data.liked) {
              newSet.add(postId);
            } else {
              newSet.delete(postId);
            }
            return newSet;
          });
          
          // Обновляем счётчик лайков: используем точное значение от API
          setPosts((prev) =>
            prev.map((p) => {
              if (p.id !== postId) return p;
              const currentCount = p._count ?? { likes: 0, comments: 0, reposts: 0 };
              return {
                ...p,
                likes: data.liked
                  ? [...p.likes, { userId: session?.user?.id || "" }]
                  : p.likes.filter((l) => l.userId !== session?.user?.id),
                _count: {
                  ...currentCount,
                  likes: data._count?.likes ?? (data.liked ? currentCount.likes + 1 : Math.max(0, currentCount.likes - 1)),
                },
              };
            })
          );
        }
      } catch (error) {
        console.error("Failed to toggle like:", error);
      }
    },
    [session]
  );

  const handleToggleComments = useCallback(
    async (postId: string) => {
      const newExpanded = new Set(expandedComments);
      if (newExpanded.has(postId)) {
        newExpanded.delete(postId);
        setExpandedComments(newExpanded);
      } else {
        newExpanded.add(postId);
        setExpandedComments(newExpanded);
        if (!comments[postId]) {
          try {
            const response = await fetch(`/api/posts/${postId}/comments`);
            if (response.ok) {
              const data = await response.json();
              setComments((prev) => ({ ...prev, [postId]: data }));
            }
          } catch (error) {
            console.error("Failed to load comments:", error);
          }
        }
      }
    },
    [expandedComments, comments]
  );

  const handleAddComment = useCallback(
    async (postId: string, content: string, parentId?: string) => {
      if (!content.trim()) return;
      try {
        const response = await fetch(`/api/posts/${postId}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, parentId }),
        });
        if (response.ok) {
          const data = await response.json();
          setComments((prev) => {
            const currentComments = prev[postId] || [];
            if (parentId) {
              const updatedComments = currentComments.map((comment: Comment) => {
                if (comment.id === parentId) {
                  return {
                    ...comment,
                    replies: [...(comment.replies || []), data],
                  };
                }
                if (comment.replies?.some((r: CommentReply) => r.id === parentId)) {
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
          // Обновляем счётчик комментариев
          setPosts((prev) =>
            prev.map((p) =>
              p.id === postId
                ? {
                    ...p,
                    _count: {
                      likes: p._count?.likes ?? 0,
                      comments: (p._count?.comments || 0) + 1,
                      reposts: p._count?.reposts ?? 0,
                    },
                  }
                : p
            )
          );
        }
      } catch (error) {
        console.error("Failed to add comment:", error);
      }
    },
    []
  );

  const updatePost = useCallback((postId: string, updates: Partial<Post>) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, ...updates } : p))
    );
  }, []);

  return {
    posts,
    comments,
    likedPosts,
    highlightPostId,
    highlightCommentId,
    expandedComments,
    showAllComments,
    viewedPosts,
    hasMore,
    isLoadingMore,
    totalPosts,
    setShowAllComments,
    setViewedPosts,
    setHighlightPostId,
    setHighlightCommentId,
    setExpandedComments,
    loadPosts,
    loadMore,
    refreshPosts,
    handleLike,
    handleToggleComments,
    handleAddComment,
    updatePost,
  };
}
