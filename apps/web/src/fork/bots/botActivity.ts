import { parseThreadKey } from "@t3tools/client-runtime/state/entities";
import type { EnvironmentId, RunId, ThreadId } from "@t3tools/contracts";
import { Atom, type AtomRegistry } from "effect/reactivity";

import { environmentThreadDetails } from "../../state/threads";
import { type BotMessage, latestBotMessage } from "./botLogic";
import { botThreadKey, findBot, readBots, subscribeBots } from "./botStore";

/** The bot's latest `send_to_user` message, read from its thread detail. */
export const botMessageAtom = Atom.family((key: string) => {
  let previous: BotMessage | null = null;
  return Atom.make((get) => {
    const thread = get(environmentThreadDetails.quietThreadAtom(parseThreadKey(key)));
    // Keep the last message while the detail reloads, so a reconnect is not a new message.
    if (thread === null) return previous;
    const next = latestBotMessage(thread.projection.turnItems);
    if (next?.itemId !== previous?.itemId) previous = next;
    return previous;
  }).pipe(Atom.withLabel(`fork-bot-message:${key}`));
});

/**
 * Keeps every bot's thread detail loaded, so the shell's completion can be checked against the
 * messages the run sent. Shells carry no message text.
 */
export function startBotWatch(registry: AtomRegistry.AtomRegistry): () => void {
  const subscriptions = new Map<string, () => void>();
  const sync = () => {
    const keys = new Set(readBots().map(botThreadKey));
    for (const [key, unsubscribe] of subscriptions) {
      if (keys.has(key)) continue;
      unsubscribe();
      subscriptions.delete(key);
    }
    for (const key of keys) {
      if (!subscriptions.has(key)) {
        subscriptions.set(
          key,
          registry.subscribe(botMessageAtom(key), () => undefined),
        );
      }
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
 * How a finished run in a bot thread alerts: null for an ordinary thread or alert, "quiet" when
 * the run sent nothing, or the bot's name and message.
 */
export function resolveBotAlert(
  registry: AtomRegistry.AtomRegistry,
  input: {
    readonly environmentId: EnvironmentId;
    readonly threadId: ThreadId;
    readonly latestRunId: RunId | null;
    readonly completion: boolean;
  },
): "quiet" | { readonly title: string; readonly body: string } | null {
  if (!input.completion) return null;
  const bot = findBot(readBots(), input.environmentId, input.threadId);
  if (bot === null) return null;
  const message = registry.get(botMessageAtom(botThreadKey(bot)));
  if (message === null || input.latestRunId === null || message.runId !== input.latestRunId) {
    return "quiet";
  }
  return { title: bot.name, body: message.text };
}
