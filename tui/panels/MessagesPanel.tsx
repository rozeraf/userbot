import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { loadChats, loadMessages } from "../data/queries";
import { POLL_CHATLIST_MS, POLL_MSGFEED_MS, POLL_UNFOCUSED_MULTIPLIER } from "../core/constants";

// ── Types ─────────────────────────────────────────────────────────────────────

import type { ChatSummary, MessageRow } from "../data/queries";

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE    = 80;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d  = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth()+1).toString().padStart(2, "0")} ${formatTime(ts)}`;
}

function preview(text: string | null, maxLen = 55): string {
  if (!text) return "(media / empty)";
  const clean = text.replace(/\n+/g, " ").trim();
  return clean.length > maxLen ? clean.slice(0, maxLen) + "…" : clean;
}

// ── MessagesPanel ─────────────────────────────────────────────────────────────

interface Props {
  height?:   number;
  isFocused: boolean;
}

type PanelSide = "chats" | "messages";

export function MessagesPanel({ height = 24, isFocused }: Props) {
  // ── Chat list state ────────────────────────────────────────────────────────
  const [chats, setChats]         = useState<ChatSummary[]>([]);
  const [chatCursor, setChatCursor] = useState(0);
  const [side, setSide]           = useState<PanelSide>("chats");

  // ── Message list state ─────────────────────────────────────────────────────
  const [msgBuffer,  setMsgBuffer] = useState<MessageRow[]>([]);
  const [msgCursor,  setMsgCursor] = useState(0);
  const [page, setPage]            = useState(0); // 0 = newest

  // ── Poll chat summaries ────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;

    const fetchChats = () => {
      const rows = loadChats();
      if (active && rows) setChats(rows);
    };

    fetchChats();
    const id = setInterval(fetchChats, isFocused ? POLL_CHATLIST_MS : POLL_CHATLIST_MS * POLL_UNFOCUSED_MULTIPLIER);
    return () => { active = false; clearInterval(id); };
  }, [isFocused]);

  // ── Poll messages for selected chat ───────────────────────────────────────
  const selectedChat = chats[chatCursor] ?? null;

  useEffect(() => {
    if (!selectedChat) return;
    let active = true;
    setMsgBuffer([]);
    setMsgCursor(0);
    setPage(0);
    let initialFetch = true;

    const fetchMsgs = () => {
      const rows = loadMessages(selectedChat.chatId);
      if (active && rows) {
        setMsgBuffer(rows);
        if (initialFetch) {
          setMsgCursor(Math.max(0, Math.min(PAGE_SIZE, rows.length) - 1));
          initialFetch = false;
        }
      }
    };

    fetchMsgs();
    const id = setInterval(fetchMsgs, isFocused ? POLL_MSGFEED_MS : POLL_MSGFEED_MS * POLL_UNFOCUSED_MULTIPLIER);
    return () => { active = false; clearInterval(id); };
  }, [selectedChat?.chatId, isFocused]);

  // ── Derived viewport ───────────────────────────────────────────────────────
  // Layout: left chat list 26 cols, right message area fills rest
  const chatListH  = Math.max(3, height - 3);
  const msgAreaH   = Math.max(3, height - 4);

  // Messages: show newest at bottom, page backwards
  const pageStart  = Math.max(0, msgBuffer.length - PAGE_SIZE * (page + 1));
  const pageEnd    = msgBuffer.length - PAGE_SIZE * page;
  const pageSlice  = msgBuffer.slice(pageStart, pageEnd);

  const safeMsgCursor  = Math.min(msgCursor, pageSlice.length - 1);

  // Visible slice for chat list
  const chatScrollTop  = Math.max(0, chatCursor - Math.floor(chatListH / 2));
  const visibleChats   = chats.slice(chatScrollTop, chatScrollTop + chatListH);

  // Keep the selected message inside the viewport.
  const msgScrollTop = Math.max(0, Math.min(
    safeMsgCursor - Math.floor(msgAreaH / 2),
    pageSlice.length - msgAreaH,
  ));
  const visibleMsgs = pageSlice.slice(msgScrollTop, msgScrollTop + msgAreaH);

  // ── Keyboard ───────────────────────────────────────────────────────────────

  useInput((input, key) => {
    if (!isFocused) return;

    const isLeft     = key.leftArrow || input === "h";
    const isRight    = key.rightArrow || input === "l" || (input === "\r" && side === "chats");
    const isUp       = key.upArrow || input === "k";
    const isDown     = key.downArrow || input === "j";
    const isPageUp   = key.pageUp || input === "u" || (key.ctrl && input === "u");
    const isPageDown = key.pageDown || input === "d" || (key.ctrl && input === "d");
    const isTop      = input === "g";
    const isBottom   = input === "G";

    // Switch sides
    if (isRight) {
      if (chats.length > 0) setSide("messages");
      return;
    }
    if (isLeft || key.escape) {
      setSide("chats");
      return;
    }

    if (side === "chats") {
      if (isUp)     { setChatCursor((c) => Math.max(0, c - 1)); return; }
      if (isDown)   { setChatCursor((c) => Math.min(chats.length - 1, c + 1)); return; }
      if (isTop)    { setChatCursor(0); return; }
      if (isBottom) { setChatCursor(chats.length - 1); return; }
    } else {
      if (isUp)       { setMsgCursor((c) => Math.max(0, c - 1)); return; }
      if (isDown)     { setMsgCursor((c) => Math.min(pageSlice.length - 1, c + 1)); return; }
      if (isTop)      { setMsgCursor(0); return; }
      if (isBottom)   { setMsgCursor(pageSlice.length - 1); return; }
      if (isPageUp)   {
        if (pageStart > 0) { setPage((p) => p + 1); setMsgCursor(PAGE_SIZE - 1); }
        return;
      }
      if (isPageDown) {
        if (page > 0) { setPage((p) => p - 1); setMsgCursor(Math.min(PAGE_SIZE, msgBuffer.length) - 1); }
        return;
      }
    }
  }, { isActive: isFocused });

  // ── Render ─────────────────────────────────────────────────────────────────

  const borderColor = isFocused ? "yellow" : "gray";

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor}
         height={height} flexShrink={0} overflow="hidden">
      {/* Title */}
      <Box paddingX={1} justifyContent="space-between">
        <Text bold color="yellow">
          💬 [2] Messages{" "}
          <Text color="gray">({chats.length} chats · {msgBuffer.length} msgs in view)</Text>
        </Text>
        <Text color="gray">
          {side === "chats"
            ? "←→ or Enter to open chat"
            : `Page ${page + 1} | PgUp/PgDn | ← back`}
        </Text>
      </Box>

      {/* Body: chat list + message feed */}
      <Box flexDirection="row" flexGrow={1}>
        {/* Chat list */}
        <Box flexDirection="column" width={26} borderStyle="single"
             borderColor={isFocused && side === "chats" ? "yellow" : "gray"}>
          {visibleChats.length === 0
            ? <Box paddingX={1}><Text color="gray">No messages yet</Text></Box>
            : visibleChats.map((chat, visIdx) => {
                const absIdx    = chatScrollTop + visIdx;
                const isActive  = absIdx === chatCursor;
                const isCurrent = isActive && side === "messages";
                return (
                  <Box key={chat.chatId} paddingX={1}
                       backgroundColor={isActive ? "blue" : undefined}>
                    <Box width={24} flexDirection="column">
                      <Text
                        bold={isActive}
                        color={isActive ? "white" : "cyan"}
                        wrap="truncate-end"
                      >
                        {chat.chatTitle.slice(0, 20)}
                      </Text>
                      <Text color={isActive ? "white" : "gray"}>
                        {chat.count} msgs · {formatDate(chat.lastTs).slice(0, 11)}
                      </Text>
                    </Box>
                  </Box>
                );
              })
          }
        </Box>

        {/* Message feed */}
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          {!selectedChat ? (
            <Text color="gray">Select a chat →</Text>
          ) : visibleMsgs.length === 0 ? (
            <Text color="gray">No messages.</Text>
          ) : (
            visibleMsgs.map((msg, visIdx) => {
              const absIdx    = msgScrollTop + visIdx;
              const isSelected = isFocused && side === "messages" && absIdx === safeMsgCursor;
              const who       = msg.isOutgoing
                ? "You"
                : (msg.senderName ?? msg.senderId ?? "?");
              const msgColor  = msg.isOutgoing ? "cyan" : "white";

              return (
                <Box key={msg.id} flexDirection="column"
                     backgroundColor={isSelected ? "gray" : undefined}
                     marginBottom={0}>
                  <Box>
                    <Text color="gray">{formatTime(msg.timestamp)} </Text>
                    <Text bold color={msg.isOutgoing ? "cyan" : "green"}>
                      {who.slice(0, 18)}:{" "}
                    </Text>
                    <Text color={isSelected ? "black" : msgColor} wrap="truncate-end">
                      {preview(msg.text)}
                    </Text>
                  </Box>
                </Box>
              );
            })
          )}
        </Box>
      </Box>

      {/* Selected message detail */}
      {isFocused && side === "messages" && pageSlice[safeMsgCursor] && (
        <Box paddingX={1} borderStyle="single" borderColor="gray">
          <Text wrap="wrap" color="gray">
            {pageSlice[safeMsgCursor]!.text ?? "(empty)"}
          </Text>
        </Box>
      )}
    </Box>
  );
}
