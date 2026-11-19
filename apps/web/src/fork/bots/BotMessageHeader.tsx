import type { TimestampFormat } from "@t3tools/contracts/settings";

import { TimelineRowTimestamp } from "../../components/chat/TimelineRowParts";
import { BotAvatar } from "./BotAvatar";
import type { Bot } from "./botStore";

/** The bot's photo, name and time above a message it sent, like a chat app. */
export function BotMessageHeader(props: {
  bot: Bot;
  /** Leave out where the row already shows its time. */
  time?: { createdAt: string; format: TimestampFormat };
}) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <BotAvatar bot={props.bot} className="size-6 text-2xs" />
      <span className="truncate text-sm font-medium text-foreground">{props.bot.name}</span>
      {props.time ? (
        <TimelineRowTimestamp
          createdAt={props.time.createdAt}
          timestampFormat={props.time.format}
          alwaysVisible
        />
      ) : null}
    </div>
  );
}
