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
const LOGS_KEY = "t3code:fork:bots:logs:v1";
const SHOW_WORK_KEY = "t3code:fork:bots:show-work";
const SERVER_KEY = "t3code:fork:bots:server";

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

const BotMessageSchema = Schema.Struct({
  itemId: Schema.String,
  runId: Schema.NullOr(Schema.String),
  text: Schema.String,
  at: Schema.String,
});

const BotLog = Schema.Struct({
  /** The newest message already alerted, so a restart does not alert it again. */
  alertedItemId: Schema.NullOr(Schema.String),
  messages: Schema.Array(BotMessageSchema),
  /** When a failing streak of wake-ups last alerted; cleared when a run completes. */
  failureAlertedAt: Schema.optional(Schema.String),
});
export type BotLog = typeof BotLog.Type;

/** A localStorage value decoded once per write, so reads are stable for useSyncExternalStore. */
function localStore<T, E>(key: string, schema: Schema.Codec<T, E>, empty: T) {
  let cached: { serialized: string | null; value: T } = { serialized: null, value: empty };
  const read = (): T => {
    let serialized: string | null = null;
    try {
      serialized = window.localStorage.getItem(key);
    } catch {
      // Storage can be unavailable; fall back to the empty value.
    }
    if (serialized !== cached.serialized) {
      cached = { serialized, value: readLocalStorageValue(key, empty, schema) };
    }
    return cached.value;
  };
  const subscribe = (onChange: () => void) => subscribeLocalStorageKey(key, onChange);
  const update = (change: (value: T) => T) => writeLocalStorageValue(key, change, empty, schema);
  return { read, subscribe, update };
}

const botsStore = localStore(BOTS_KEY, Bots, [] as ReadonlyArray<Bot>);
const logsStore = localStore(
  LOGS_KEY,
  Schema.Record(Schema.String, BotLog),
  {} as Readonly<Record<string, BotLog>>,
);

export const readBots = botsStore.read;
export const subscribeBots = botsStore.subscribe;
export const updateBots = botsStore.update;

export function useBots(): ReadonlyArray<Bot> {
  return useSyncExternalStore(botsStore.subscribe, botsStore.read, botsStore.read);
}

const EMPTY_LOG: BotLog = { alertedItemId: null, messages: [] };

export function readBotLog(key: string): BotLog {
  return logsStore.read()[key] ?? EMPTY_LOG;
}

export function useBotLog(key: string | null): BotLog {
  const logs = useSyncExternalStore(logsStore.subscribe, logsStore.read, logsStore.read);
  return (key === null ? undefined : logs[key]) ?? EMPTY_LOG;
}

export function updateBotLog(key: string, change: (log: BotLog) => BotLog | null): void {
  logsStore.update((logs) => {
    const { [key]: current, ...rest } = logs;
    const next = change(current ?? EMPTY_LOG);
    return next === null ? rest : { ...rest, [key]: next };
  });
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

/** The server the last bot was created on, so the next one defaults to it. */
export function readLastBotServer(): string | null {
  return readLocalStorageValue(SERVER_KEY, null, Schema.NullOr(Schema.String));
}

export function rememberBotServer(environmentId: string): void {
  writeLocalStorageValue(SERVER_KEY, environmentId, null, Schema.NullOr(Schema.String));
}
