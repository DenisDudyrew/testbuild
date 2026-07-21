"use client";

import { useEffect, useRef } from "react";

interface ViewTrackerProps {
  postId: string;
  viewedPosts: Set<string>;
  setViewedPosts: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export default function ViewTracker({ postId, viewedPosts, setViewedPosts }: ViewTrackerProps) {
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    if (viewedPosts.has(postId)) return;

    calledRef.current = true;
    
    const trackView = async () => {
      try {
        await fetch(`/api/posts/${postId}/view`, {
          method: 'POST',
        });
        setViewedPosts((prev) => new Set(prev).add(postId));
      } catch {
        // тихий фолбек
      }
    };

    trackView();
  }, [postId, viewedPosts, setViewedPosts]);

  return null;
}
