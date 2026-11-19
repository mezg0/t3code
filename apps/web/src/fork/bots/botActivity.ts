import { parseThreadKey } from "@t3tools/client-runtime/state/entities";
import type { EnvironmentId, RunId, ThreadId } from "@t3tools/contracts";
import type { AnyRouter } from "@tanstack/react-router";
import { Atom, type AtomRegistry } from "effect/reactivity";
import { msg } from "gt-react";

import { toastManager } from "../../components/ui/toast";
import { getClientSettings } from "../../hooks/useSettings";
import { m } from "../../i18n/messages";
import { environmentThreadDetails } from "../../state/threads";
import {
  hasDesktopNotifications,
  hasNotificationSound,
  playNotificationSound,
  threadNotificationTag,
} from "../../threadNotifications";
import { type BotMessage, botMessages, isRunStartedByUser, mergeBotLog } from "./botLogic";
import {
  type Bot,
  botThreadKey,
  findBot,
  readBotLog,
  readBots,
  subscribeBots,
  updateBotLog,
} from "./botStore";

const threadAtom = (key: string) => environmentThreadDetails.quietThreadAtom(parseThreadKey(key));

/** The bot's `send_to_user` messages in its loaded turns; null until the detail loads. */
const botMessagesAtom = Atom.family((key: string) => {
  let previous: ReadonlyArray<BotMessage> | null = null;
  return Atom.make((get) => {
    const thread = get(threadAtom(key));
    if (thread === null) return null;
    const next = botMessages(thread.projection.turnItems);
    const same =
      previous !== null &&
      previous.length === next.length &&
      previous.at(-1)?.itemId === next.at(-1)?.itemId;
    if (!same) previous = next;
    return previous;
  }).pipe(Atom.withLabel(`fork-bot-messages:${key}`));
});

function presentBotMessage(router: AnyRouter, bot: Bot, message: BotMessage): void {
  const params = (router.state.matches.at(-1)?.params ?? {}) as {
    environmentId?: string;
    threadId?: string;
  };
  const focused = document.visibilityState === "visible" && document.hasFocus();
  if (focused && params.environmentId === bot.environmentId && params.threadId === bot.threadId) {
    return;
  }
  const { notificationMode: mode, inAppNotificationsEnabled } = getClientSettings();
  if (hasNotificationSound(mode)) {
    void playNotificationSound("completion", () =>
      hasNotificationSound(getClientSettings().notificationMode),
    );
  }
  const open = () =>
    void router.navigate({
      to: "/$environmentId/$threadId",
      params: { environmentId: bot.environmentId, threadId: bot.threadId },
    });
  if (focused) {
    if (!inAppNotificationsEnabled) return;
    const toastId = toastManager.add({
      type: "info",
      title: bot.name,
      description: message.text,
      data: { hideCopyButton: true },
      actionProps: {
        children: m(msg("Open thread")),
        onClick: () => {
          toastManager.close(toastId);
          open();
        },
      },
    });
    return;
  }
  if (
    !hasDesktopNotifications(mode) ||
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  ) {
    return;
  }
  try {
    const notification = new Notification(bot.name, {
      body: message.text,
      tag: threadNotificationTag(bot.environmentId, bot.threadId),
      silent: true,
    });
    notification.addEventListener("click", () => {
      notification.close();
      window.focus();
      void window.desktopBridge?.revealWindow().catch(() => undefined);
      open();
    });
  } catch {
    // Some browsers expose Notification but reject desktop presentation.
  }
}

/**
 * Keeps every bot's thread detail loaded (shells carry no message text), logs the messages it
 * sends, and alerts each new one once, even if it arrived while this client was away.
 */
export function startBotWatch(registry: AtomRegistry.AtomRegistry, router: AnyRouter): () => void {
  const subscriptions = new Map<string, () => void>();
  const observe = (key: string, seen: ReadonlyArray<BotMessage> | null) => {
    const bot = readBots().find((candidate) => botThreadKey(candidate) === key);
    if (bot === undefined || seen === null) return;
    const log = readBotLog(key);
    const { messages, added } = mergeBotLog(log.messages, seen);
    const newest = added.at(-1);
    if (newest === undefined) return;
    const alert = newest.itemId !== log.alertedItemId;
    updateBotLog(key, () => ({ alertedItemId: newest.itemId, messages }));
    if (alert) presentBotMessage(router, bot, newest);
  };
  const sync = () => {
    const keys = new Set(readBots().map(botThreadKey));
    for (const [key, unsubscribe] of subscriptions) {
      if (keys.has(key)) continue;
      unsubscribe();
      subscriptions.delete(key);
    }
    for (const key of keys) {
      if (subscriptions.has(key)) continue;
      subscriptions.set(
        key,
        registry.subscribe(botMessagesAtom(key), (seen) => observe(key, seen), {
          immediate: true,
        }),
      );
    }
  };
  sync();
  const stop = subscribeBots(sync);
  return () => {
    stop();
    for (const unsubscribe of subscriptions.values()) unsubscribe();
    subscriptions.clear();
  };
}

/**
 * Whether a finished run in a bot thread uses the ordinary completion alert: only when the user
 * started it by typing and it sent no message. Messages alert through startBotWatch.
 */
export function resolveBotCompletion(
  registry: AtomRegistry.AtomRegistry,
  input: {
    readonly environmentId: EnvironmentId;
    readonly threadId: ThreadId;
    readonly latestRunId: RunId | null;
    readonly completion: boolean;
  },
): "quiet" | null {
  if (!input.completion) return null;
  const bot = findBot(readBots(), input.environmentId, input.threadId);
  if (bot === null) return null;
  const thread = registry.get(threadAtom(botThreadKey(bot)));
  const runId = input.latestRunId;
  if (thread === null || runId === null) return "quiet";
  const items = thread.projection.turnItems;
  // A run that sent a message already alerted with it.
  const sentMessage = botMessages(items).some((message) => message.runId === runId);
  return !sentMessage && isRunStartedByUser(items, runId, bot.setupMessageId) ? null : "quiet";
}
