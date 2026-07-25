"use client";

import Image from "next/image";
import { useMemo } from "react";

const GRADIENTS = [
  "from-pink-500 to-rose-500",
  "from-blue-500 to-cyan-500",
  "from-green-500 to-emerald-500",
  "from-purple-500 to-violet-500",
  "from-amber-500 to-orange-500",
  "from-teal-500 to-cyan-600",
  "from-red-500 to-pink-500",
  "from-indigo-500 to-purple-600",
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getGradient(id: string): string {
  return GRADIENTS[hashString(id) % GRADIENTS.length];
}

interface AvatarProps {
  id?: string;
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
  onClick?: () => void;
  round?: boolean;
}

export default function Avatar({ id, src, name, size = 10, className = "", onClick, round }: AvatarProps) {
  const gradient = useMemo(() => getGradient(id || name), [id, name]);
  const letter = name.charAt(0).toUpperCase();

  const sizeClass = `size-${size}`;
  const roundClass = round ? "rounded-full" : size >= 10 ? "rounded-2xl" : "rounded-full";

  if (src) {
    return (
      <Image
        src={src}
        alt={name}
        width={size * 4}
        height={size * 4}
        className={`${sizeClass} shrink-0 object-cover ${roundClass} ring-2 ring-zinc-200 dark:ring-zinc-700 transition-all duration-200 hover:ring-indigo-400 ${onClick ? "cursor-pointer" : ""} ${className}`}
        onClick={onClick}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} shrink-0 bg-gradient-to-br ${gradient} flex items-center justify-center font-bold text-white shadow-lg ${roundClass} transition-all duration-200 hover:ring-2 hover:ring-indigo-400 ${onClick ? "cursor-pointer" : ""} ${className}`}
      onClick={onClick}
    >
      <span className={size >= 8 ? "text-lg" : size >= 6 ? "text-sm" : "text-xs"}>
        {letter}
      </span>
    </div>
  );
}
