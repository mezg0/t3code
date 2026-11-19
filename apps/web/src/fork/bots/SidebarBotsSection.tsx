import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useNavigate, useParams } from "@tanstack/react-router";
import * as DateTime from "effect/DateTime";
import { useGT } from "gt-react";
import { PencilIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { resolveSidebarThreadStatus } from "../../components/Sidebar.logic";
import { cn } from "../../lib/utils";
import { useThreadShell } from "../../state/entities";
import { buildThreadRouteParams, resolveThreadRouteTarget } from "../../threadRoutes";
import { botMessageAtom } from "./botActivity";
import { BotAvatar } from "./BotAvatar";
import { BotDialog } from "./BotDialog";
import { type Bot, botThreadKey, useBots } from "./botStore";

export function SidebarBotsSection() {
  const gt = useGT();
  const bots = useBots();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Bot | null>(null);
  const target = resolveThreadRouteTarget(useParams({ strict: false }));
  const routeKey = target?.kind === "server" ? botThreadKey(target.threadRef) : null;

  return (
    <div className="mb-2 flex flex-col gap-px">
      <div className="flex items-end gap-2 px-2 pb-1 text-sidebar-muted-foreground text-xs leading-4 font-medium">
        <span className="min-w-0 flex-1 truncate">
          {gt("Bots", { $context: "sidebar section" })}
        </span>
        {bots.length > 0 ? <span className="font-normal tabular-nums">{bots.length}</span> : null}
        <button
          type="button"
          aria-label={gt("New bot")}
          onClick={() => setCreating(true)}
          className="-mb-0.5 grid size-4 cursor-pointer place-items-center rounded-sm hover:text-sidebar-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
  const message = useAtomValue(botMessageAtom(botThreadKey(bot)));
  const status = shell === null ? null : resolveSidebarThreadStatus(shell);
  const lastVisitedAt = shell?.lastVisitedAt ?? null;
  const unread =
    message !== null &&
    (lastVisitedAt === null || DateTime.toEpochMillis(message.at) > Date.parse(lastVisitedAt));
  const subtitle =
    status === "approval" || status === "input" || status === "request"
      ? gt("Needs you")
      : status === "failed" || status === "limited"
        ? gt("Something went wrong")
        : status === "working" || status === "preparing"
          ? gt("Working…")
          : (message?.text ?? gt("Quiet"));

  return (
    <div
      className={cn(
        "group/bot relative flex h-9 items-center gap-2 rounded-md px-2 hover:bg-sidebar-row-hover",
        props.selected && "bg-sidebar-row-selected",
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
      <BotAvatar bot={bot} className="pointer-events-none size-5 text-3xs" />
      <div className="pointer-events-none min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm">{bot.name}</div>
        <div className="truncate text-2xs text-sidebar-muted-foreground">{subtitle}</div>
      </div>
      {unread ? (
        <span
          aria-label={gt("New message")}
          className="size-1.5 shrink-0 rounded-full bg-primary"
        />
      ) : null}
      <button
        type="button"
        aria-label={gt("Edit {name}", { name: bot.name })}
        onClick={props.onEdit}
        className="relative hidden size-5 cursor-pointer place-items-center rounded-sm text-sidebar-muted-foreground hover:text-sidebar-foreground focus-visible:grid group-hover/bot:grid"
      >
        <PencilIcon aria-hidden className="size-3" />
      </button>
    </div>
  );
}
