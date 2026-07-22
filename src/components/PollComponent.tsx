"use client";

import { useState } from "react";
import { Check, Clock } from "lucide-react";
import type { Poll } from "@/types/post";

interface PollComponentProps {
  poll: Poll;
  currentUserId?: string;
  postId: string;
  onVote: (pollId: string, optionId: string, postId: string) => void;
}

export default function PollComponent({ poll, currentUserId, postId, onVote }: PollComponentProps) {
  const [votedOptionId, setVotedOptionId] = useState<string | null>(poll.votedOptionId || null);
  const [voting, setVoting] = useState(false);

  const totalVotes = poll.options.reduce((sum, o) => sum + (o._count?.votes || 0), 0);

  const isExpired = poll.expiresAt ? new Date(poll.expiresAt) < new Date() : false;

  const handleVote = async (optionId: string) => {
    if (votedOptionId || isExpired || voting) return;
    setVoting(true);
    onVote(poll.id, optionId, postId);
    setVotedOptionId(optionId);
    setVoting(false);
  };

  return (
    <div className="mt-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/30 p-3">
      <p className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {poll.question}
      </p>
      {isExpired && (
        <div className="mb-2 flex items-center gap-1 text-xs text-zinc-400">
          <Clock className="size-3" />
          <span>Опрос завершён</span>
        </div>
      )}
      <div className="space-y-1.5">
        {poll.options.map((option) => {
          const votes = option._count?.votes || 0;
          const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
          const isSelected = votedOptionId === option.id;

          const btnClass = isSelected
            ? "relative w-full overflow-hidden rounded-lg px-3 py-2 text-left text-xs transition-all duration-200 border border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
            : votedOptionId
              ? "relative w-full overflow-hidden rounded-lg px-3 py-2 text-left text-xs transition-all duration-200 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300 opacity-70"
              : "relative w-full overflow-hidden rounded-lg px-3 py-2 text-left text-xs transition-all duration-200 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300 hover:border-indigo-400 dark:hover:border-indigo-500";

          const barClass = isSelected
            ? "absolute left-0 top-0 h-full rounded-l-lg transition-all duration-500 bg-indigo-500/15"
            : "absolute left-0 top-0 h-full rounded-l-lg transition-all duration-500 bg-zinc-100 dark:bg-zinc-700/50";

          return (
            <button
              key={option.id}
              onClick={() => handleVote(option.id)}
              disabled={!!votedOptionId || isExpired}
              className={btnClass}
            >
              {/* Progress bar */}
              <span
                className={barClass}
                style={{ width: `${pct}%` }}
              />
              {/* Content */}
              <span className="relative flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  {isSelected && <Check className="size-3 text-indigo-500" />}
                  {option.text}
                </span>
                <span className="font-medium text-zinc-500 dark:text-zinc-400">
                  {pct}%
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
        {totalVotes} голос{totalVotes === 1 ? "" : "ов"}
      </p>
    </div>
  );
}
