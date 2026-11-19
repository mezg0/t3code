import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useNavigate, useParams } from "@tanstack/react-router";
import { msg, useGT, useMessages } from "gt-react";
import { PencilIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { resolveSidebarThreadStatus } from "../../components/Sidebar.logic";
import { useNowMinute } from "../../hooks/useNowMinute";
import { cn } from "../../lib/utils";
import { useThreadShell } from "../../state/entities";
import { buildThreadRouteParams, resolveThreadRouteTarget } from "../../threadRoutes";
import { formatRelativeTime } from "../../timestampFormat";
import { BotAvatar } from "./BotAvatar";
import { BotDialog } from "./BotDialog";
import { type Bot, botThreadKey, useBotLog, useBots } from "./botStore";

export function SidebarBotsSection() {
  const gt = useGT();
  const bots = useBots();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Bot | null>(null);
  const target = resolveThreadRouteTarget(useParams({ strict: false }));
  const routeKey = target?.kind === "server" ? botThreadKey(target.threadRef) : null;

  return (
    <div className="mb-1 flex flex-col gap-px">
      {/* Matches the sidebar's section headers; the + sits where their chevron does. */}
      <div className="mx-0.5 flex h-8 items-center gap-2 px-2 text-xs font-medium text-sidebar-muted-foreground">
        <span className="min-w-0 truncate">{gt("Bots", { $context: "sidebar section" })}</span>
        <span aria-hidden className="min-w-2 flex-1" />
        {bots.length > 0 ? <span className="font-normal tabular-nums">{bots.length}</span> : null}
        <button
          type="button"
          aria-label={gt("New bot")}
          onClick={() => setCreating(true)}
          className="-me-1 grid size-5 shrink-0 cursor-pointer place-items-center rounded-sm hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <PlusIcon aria-hidden className="size-3.5" />
        </button>
      </div>
      {bots.map((bot) => (
        <BotRow
          key={botThreadKey(bot)}
          bot={bot}
          selected={routeKey === botThreadKey(bot)}
          onEdit={() => setEditing(bot)}
        />
      ))}
      <BotDialog open={creating} onOpenChange={setCreating} />
      <BotDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        {...(editing === null ? {} : { bot: editing })}
      />
    </div>
  );
}

function BotRow(props: { bot: Bot; selected: boolean; onEdit: () => void }) {
  const gt = useGT();
  const navigate = useNavigate();
  const { bot } = props;
  const threadRef = scopeThreadRef(bot.environmentId, bot.threadId);
  const shell = useThreadShell(threadRef);
  const message = useBotLog(botThreadKey(bot)).messages.at(-1) ?? null;
  const status = shell === null ? null : resolveSidebarThreadStatus(shell);
  const lastVisitedAt = shell?.lastVisitedAt ?? null;
  const unread =
    message !== null &&
    (lastVisitedAt === null || Date.parse(message.at) > Date.parse(lastVisitedAt));
  const needsYou = status === "approval" || status === "input" || status === "request";
  const failed = status === "failed" || status === "limited";
  const working = status === "working" || status === "preparing";
  const subtitle = needsYou
    ? gt("Needs you")
    : failed
      ? gt("Something went wrong")
      : working
        ? gt("Working…")
        : (message?.text ?? gt("Quiet"));

  return (
    <div
      className={cn(
        "group/bot relative mx-0.5 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sidebar-foreground",
        props.selected
          ? "bg-sidebar-row-active light:ring-1 light:ring-inset light:ring-sidebar-border/70"
          : "hover:bg-sidebar-row-hover",
      )}
      onContextMenu={(event) => {
        event.preventDefault();
        props.onEdit();
      }}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-pointer rounded-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-label={bot.name}
        onClick={() =>
          void navigate({
            to: "/$environmentId/$threadId",
            params: buildThreadRouteParams(threadRef),
          })
        }
      />
      <BotAvatar bot={bot} className="pointer-events-none size-8 text-sm" />
      <div className="pointer-events-none flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex h-5 min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{bot.name}</span>
          {/* The edit button takes the time's place on hover, like a thread row's actions. */}
          <span className="shrink-0 text-xs text-sidebar-muted-foreground tabular-nums group-focus-within/bot:hidden group-hover/bot:hidden">
            {message !== null ? <BotMessageTime timestamp={message.at} /> : null}
          </span>
          <button
            type="button"
            aria-label={gt("Edit {name}", { name: bot.name })}
            onClick={props.onEdit}
            className="pointer-events-auto relative -me-1 hidden size-5 shrink-0 cursor-pointer place-items-center rounded-sm text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:grid focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring group-focus-within/bot:grid group-hover/bot:grid"
          >
            <PencilIcon aria-hidden className="size-3" />
          </button>
        </div>
        <div className="flex h-4 min-w-0 items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-xs",
              needsYou
                ? "text-warning"
                : failed
                  ? "text-error"
                  : unread
                    ? "text-sidebar-foreground/90"
                    : "text-sidebar-muted-foreground",
            )}
          >
            {subtitle}
          </span>
          {unread ? (
            <span
              aria-label={gt("New message")}
              className="size-2 shrink-0 rounded-full bg-primary"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Ticks once a minute on its own, so only the label re-renders.
function BotMessageTime(props: { timestamp: string }) {
  const nowMinute = useNowMinute();
  const m = useMessages();
  const parts = formatRelativeTime(props.timestamp, Date.parse(`${nowMinute}:00.000Z`), m);
  if (parts === null) return null;
  return parts.suffix === null ? m(msg("now", { $context: "relative time" })) : parts.value;
}
