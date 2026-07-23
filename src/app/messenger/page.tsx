"use client";

import { useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Shield, MessageCircle, Lock, Sparkles } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import ConversationList from "@/components/messenger/ConversationList";
import ChatView from "@/components/messenger/ChatView";
import NewChatModal from "@/components/messenger/NewChatModal";

interface Conversation {
  id: string;
  type: string;
  name: string | null;
  participants: { id: string; username: string; avatar: string | null; lastSeenAt?: string | null }[];
}

export default function MessengerPage() {
  const { data: session } = useSession();
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showChatOnMobile, setShowChatOnMobile] = useState(false);

  const handleSelectConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/messenger/conversations/${id}`);
      if (res.ok) {
        const found: Conversation = await res.json();
        setActiveConversation(found);
        setShowChatOnMobile(true);
      }
    } catch {}
  }, []);

  const handleNewChatCreated = useCallback((conversationId: string) => {
    handleSelectConversation(conversationId);
  }, [handleSelectConversation]);

  const handleBackToList = useCallback(() => {
    setShowChatOnMobile(false);
    setActiveConversation(null);
  }, []);

  if (!session) {
    return (
      <>
        <Sidebar />
        <div className="pl-60 max-md:pl-0 min-h-screen bg-zinc-50 flex items-center justify-center">
          <div className="text-center">
            <MessageCircle className="size-12 mx-auto mb-4 text-zinc-300" />
            <p className="text-zinc-500">Войдите, чтобы использовать мессенджер</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Sidebar />
      <div className="pl-60 max-md:pl-0 w-full overflow-hidden min-h-screen bg-gradient-to-br from-zinc-50 via-white to-zinc-100 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-950">
        <div className="flex h-screen overflow-hidden">
          {/* Desktop: Conversation List */}
          <div
            className={`
              w-[380px] max-md:w-full border-r border-zinc-200 dark:border-white/10 flex flex-col shrink-0
              ${showChatOnMobile ? "hidden md:flex" : "flex"}
            `}
          >
            <div className="flex-1 overflow-hidden">
              <ConversationList
                activeConversationId={activeConversation?.id || null}
                onSelect={handleSelectConversation}
                onNewChat={() => setShowNewChat(true)}
              />
            </div>
          </div>

          {/* Desktop: Chat Area */}
          <div
            className={`
              flex-1 flex flex-col min-w-0
              ${!showChatOnMobile ? "hidden md:flex" : "flex"}
            `}
          >
            {activeConversation ? (
              <ChatView
                conversation={activeConversation}
                onBack={handleBackToList}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-zinc-50 via-white to-zinc-100 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-950">
                <div className="text-center max-w-sm px-6">
                  {/* Animated icon */}
                  <div className="relative mx-auto mb-6 w-20 h-20">
                    <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 animate-glow" />
                    <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl animate-breathe">
                      <Lock className="size-9 text-white" />
                    </div>
                  </div>

                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2 animate-fadeIn">
                    Ваши сообщения защищены
                  </h2>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-8">
                    Все сообщения шифруются сквозным шифрованием. 
                    Никто, кроме участников чата, не может их прочитать.
                  </p>

                  <div className="flex flex-col items-center gap-3">
                    <button
                      onClick={() => setShowNewChat(true)}
                      className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-medium hover:scale-105 transition-transform shadow-lg shadow-indigo-500/25"
                    >
                      <Sparkles className="size-4" />
                      Написать кому-нибудь
                    </button>

                    <div className="flex items-center gap-2 mt-4 text-[11px] text-zinc-400 dark:text-zinc-600">
                      <Shield className="size-3" />
                      <span>AES-256-GCM шифрование</span>
                      <span className="mx-1">•</span>
                      <Lock className="size-3" />
                      <span>Сквозное шифрование</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onSelect={handleNewChatCreated}
        />
      )}
    </>
  );
}
