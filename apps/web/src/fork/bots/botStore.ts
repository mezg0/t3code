import { threadKey } from "@t3tools/client-runtime/state/entities";
import { EnvironmentId, MessageId, ProjectId, ThreadId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useSyncExternalStore } from "react";

import {
  readLocalStorageValue,
  subscribeLocalStorageKey,
  writeLocalStorageValue,
} from "../../hooks/useLocalStorage";

// Bots live only in this client: the server sees an ordinary project and thread.
const BOTS_KEY = "t3code:fork:bots:v1";
const SHOW_WORK_KEY = "t3code:fork:bots:show-work";

const Bot = Schema.Struct({
  environmentId: EnvironmentId,
  projectId: ProjectId,
  threadId: ThreadId,
  /** The setup prompt the client sent; the chat view hides it. */
  setupMessageId: MessageId,
  name: Schema.String,
  /** A small square image as a data URL. */
  avatar: Schema.NullOr(Schema.String),
});
export type Bot = typeof Bot.Type;

const Bots = Schema.Array(Bot);
const EMPTY: ReadonlyArray<Bot> = [];

let cached: { serialized: string | null; bots: ReadonlyArray<Bot> } = {
  serialized: null,
  bots: EMPTY,
};

function readSerialized(): string | null {
  try {
    return window.localStorage.getItem(BOTS_KEY);
  } catch {
    return null;
  }
}

/** Stable between writes, so it can back useSyncExternalStore. */
export function readBots(): ReadonlyArray<Bot> {
  const serialized = readSerialized();
  if (serialized !== cached.serialized) {
    cached = { serialized, bots: readLocalStorageValue(BOTS_KEY, EMPTY, Bots) };
  }
  return cached.bots;
}

export function subscribeBots(onChange: () => void): () => void {
  return subscribeLocalStorageKey(BOTS_KEY, onChange);
}

export function useBots(): ReadonlyArray<Bot> {
  return useSyncExternalStore(subscribeBots, readBots, readBots);
}

export function updateBots(update: (bots: ReadonlyArray<Bot>) => ReadonlyArray<Bot>): void {
  writeLocalStorageValue(BOTS_KEY, update, EMPTY, Bots);
}

export function botThreadKey(bot: Pick<Bot, "environmentId" | "threadId">): string {
  return threadKey({ environmentId: bot.environmentId, threadId: bot.threadId });
}

export function findBot(
  bots: ReadonlyArray<Bot>,
  environmentId: EnvironmentId | null | undefined,
  threadId: ThreadId | null | undefined,
): Bot | null {
  if (environmentId == null || threadId == null) return null;
  return (
    bots.find((bot) => bot.environmentId === environmentId && bot.threadId === threadId) ?? null
  );
}

export function useBot(
  environmentId: EnvironmentId | null | undefined,
  threadId: ThreadId | null | undefined,
): Bot | null {
  return findBot(useBots(), environmentId, threadId);
}

export function isBotProject(
  bots: ReadonlyArray<Bot>,
  environmentId: EnvironmentId,
  projectId: ProjectId,
): boolean {
  return bots.some((bot) => bot.environmentId === environmentId && bot.projectId === projectId);
}

function readShowWork(): boolean {
  return readLocalStorageValue(SHOW_WORK_KEY, false, Schema.Boolean);
}

/** Whether bot threads show every tool call instead of only their messages. */
export function useBotShowWork(): [boolean, (value: boolean) => void] {
  const showWork = useSyncExternalStore(
    (onChange) => subscribeLocalStorageKey(SHOW_WORK_KEY, onChange),
    readShowWork,
    readShowWork,
  );
  return [showWork, (value) => writeLocalStorageValue(SHOW_WORK_KEY, value, false, Schema.Boolean)];
}
