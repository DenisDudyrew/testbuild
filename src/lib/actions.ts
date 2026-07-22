"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { createPostSchema, validate } from "@/lib/validation";

// ============ POSTS ============

export async function createPost(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const content = formData.get("content") as string;
  const mediaUrl = formData.get("mediaUrl") as string | null;
  const mediaType = formData.get("mediaType") as string | null;

  const validation = validate(createPostSchema, { content, mediaUrl, mediaType });
  if (!validation.success) {
    return { error: validation.error };
  }

  if (!content && !mediaUrl) {
    return { error: "Post must have content or media" };
  }

  // Parse hashtags
  const hashtagNames = (content?.match(/#[\wа-яё]+/gi) || []).map(t => t.toLowerCase());
  const uniqueTags = [...new Set(hashtagNames)];

  const post = await prisma.post.create({
    data: {
      userId: session.user.id,
      content: content || "",
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || null,
      hashtags: {
        create: await Promise.all(uniqueTags.map(async (name) => {
          const hashtag = await prisma.hashtag.upsert({
            where: { name },
            update: {},
            create: { name },
          });
          return { hashtagId: hashtag.id };
        })),
      },
    },
    include: {
      user: { select: { username: true, avatar: true } },
    },
  });

  revalidatePath("/feed");
  return { post };
}

export async function deletePost(postId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post || post.userId !== session.user.id) {
    return { error: "Forbidden" };
  }

  await prisma.post.delete({ where: { id: postId } });
  revalidatePath("/feed");
  return { success: true };
}

export async function editPost(postId: string, content: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post || post.userId !== session.user.id) {
    return { error: "Forbidden" };
  }

  await prisma.post.update({
    where: { id: postId },
    data: { content },
  });

  revalidatePath("/feed");
  return { success: true };
}

// ============ LIKES ============

export async function toggleLike(postId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const existing = await prisma.like.findUnique({
    where: { userId_postId: { userId: session.user.id, postId } },
  });

  if (existing) {
    await prisma.like.delete({ where: { id: existing.id } });
    return { liked: false };
  }

  const like = await prisma.like.create({
    data: { userId: session.user.id, postId },
  });

  // Уведомление
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (post && post.userId !== session.user.id) {
    await prisma.notification.create({
      data: {
        userId: post.userId,
        type: "like",
        actorId: session.user.id,
        postId,
        likeId: like.id,
      },
    });
  }

  revalidatePath("/feed");
  return { liked: true };
}

// ============ COMMENTS ============

export async function addComment(postId: string, content: string, parentId?: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  if (!content.trim()) {
    return { error: "Content is required" };
  }

  const comment = await prisma.comment.create({
    data: {
      userId: session.user.id,
      postId,
      content: content.trim(),
      parentId: parentId || null,
    },
    include: {
      user: { select: { id: true, username: true, avatar: true } },
    },
  });

  // Уведомление
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (post && post.userId !== session.user.id) {
    await prisma.notification.create({
      data: {
        userId: post.userId,
        type: "comment",
        actorId: session.user.id,
        postId,
        commentId: comment.id,
      },
    });
  }

  revalidatePath("/feed");
  return { comment };
}

// ============ FOLLOW ============

export async function toggleFollow(userId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  if (userId === session.user.id) {
    return { error: "Cannot follow yourself" };
  }

  const existing = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: session.user.id, followingId: userId } },
  });

  if (existing) {
    await prisma.follow.delete({ where: { id: existing.id } });
    return { followed: false };
  }

  await prisma.follow.create({
    data: { followerId: session.user.id, followingId: userId },
  });

  revalidatePath(`/profile/${userId}`);
  return { followed: true };
}

// ============ BOOKMARKS ============

export async function toggleBookmark(postId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const existing = await prisma.bookmark.findUnique({
    where: { userId_postId: { userId: session.user.id, postId } },
  });

  if (existing) {
    await prisma.bookmark.delete({ where: { id: existing.id } });
    return { bookmarked: false };
  }

  await prisma.bookmark.create({
    data: { userId: session.user.id, postId },
  });

  revalidatePath("/bookmarks");
  return { bookmarked: true };
}
