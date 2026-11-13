import { postProcessEnvironmentTranscript } from "@t3tools/client-runtime/voice-input";
import type { EnvironmentId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useEffect } from "react";

import { enabledEnvironmentIds } from "@t3tools/client-runtime/state/connections";
import { SettingResetButton, SettingsRow } from "../components/settings/settingsLayout";
import { Switch } from "../components/ui/switch";
import { environmentCatalog } from "../connection/catalog";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { useLocalStorage, writeLocalStorageValue } from "../hooks/useLocalStorage";
import { runEnvironmentSpeech } from "../speech/runEnvironmentSpeech";
import { readPreparedConnection } from "../state/session";
import {
  KEY_POINT_KINDS,
  KEY_POINTS_INSTRUCTIONS,
  type KeyPointKind,
  parseKeyPoints,
} from "./keyPointsLogic";

// Fork: per-device, kept out of the synced settings schema so the stock server never sees it.
const ENABLED_KEY = "t3fork:key-points:enabled";
const CACHE_KEY = "t3fork:key-points:cache:v2";
const DEFAULT_ENABLED = true;
/** Shorter replies are quick to read in full. */
const MIN_REPLY_LENGTH = 1200;
const MAX_REPLY_LENGTH = 60_000;
const MAX_CACHED_REPLIES = 150;

const Points = Schema.Array(Schema.String);
const KeyPointsCache = Schema.Record(
  Schema.String,
  Schema.Struct({ ask: Points, key: Points, watch: Points }),
);
type KeyPointsCache = typeof KeyPointsCache.Type;
const EMPTY_CACHE: KeyPointsCache = {};

const LABELS: Record<KeyPointKind, string> = {
  ask: "Needs you",
  key: "Key",
  watch: "Watch",
};

function useKeyPointsEnabled() {
  return useLocalStorage(ENABLED_KEY, DEFAULT_ENABLED, Schema.Boolean);
}

const pending = new Set<string>();
let queue: Promise<void> = Promise.resolve();

async function askEnvironment(environmentId: EnvironmentId, text: string) {
  const prepared = readPreparedConnection(environmentId);
  if (!prepared) return null;
  try {
    const result = await runEnvironmentSpeech(
      postProcessEnvironmentTranscript(
        prepared,
        text,
        { text: "", selection: { start: 0, end: 0 } },
        {
          speechCustomWords: [],
          speechPostProcessingPrompt: {
            mode: "custom",
            customInstructions: KEY_POINTS_INSTRUCTIONS,
          },
        },
        () => true,
      ),
    );
    return parseKeyPoints(result.text);
  } catch {
    return null;
  }
}

/**
 * One request at a time, once per reply for this page load. Any connected
 * environment can read the text, so one that fails (an older server, or no text
 * model there) hands over to the next. No card is the fallback.
 */
function requestKeyPoints(environmentId: EnvironmentId, messageId: string, text: string) {
  if (pending.has(messageId)) return;
  pending.add(messageId);
  queue = queue.then(async () => {
    const catalog = appAtomRegistry.get(environmentCatalog.catalogValueAtom);
    const others = [...enabledEnvironmentIds(catalog)].filter((id) => id !== environmentId);
    for (const candidate of [environmentId, ...others]) {
      const points = await askEnvironment(candidate, text);
      if (!points) continue;
      writeLocalStorageValue(
        CACHE_KEY,
        (cache) => {
          const entries = Object.entries({ ...cache, [messageId]: points });
          return Object.fromEntries(entries.slice(-MAX_CACHED_REPLIES));
        },
        EMPTY_CACHE,
        KeyPointsCache,
      );
      return;
    }
  });
}

/**
 * The card under a finished assistant reply. `generate` marks the reply worth
 * asking the model about (the latest finished one); a cached card shows for any reply.
 */
export function KeyPointsCard(props: {
  readonly messageId: string;
  readonly environmentId: EnvironmentId;
  readonly text: string;
  readonly settled: boolean;
  readonly generate: boolean;
}) {
  const { messageId, environmentId, text, settled, generate } = props;
  const [enabled] = useKeyPointsEnabled();
  const [cache] = useLocalStorage(CACHE_KEY, EMPTY_CACHE, KeyPointsCache);
  const points = enabled && settled ? cache[messageId] : undefined;
  const wanted = enabled && settled && generate && !points && text.length >= MIN_REPLY_LENGTH;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- asks the model once when the latest reply has finished
  useEffect(() => {
    if (wanted) requestKeyPoints(environmentId, messageId, text.slice(0, MAX_REPLY_LENGTH));
  }, [wanted, environmentId, messageId, text]);

  const shown = points ? KEY_POINT_KINDS.filter((kind) => points[kind].length > 0) : [];
  if (!points || shown.length === 0) return null;

  return (
    <dl className="fork-key-points" data-thread-find-ignore>
      {shown.map((kind) => (
        <div key={kind} data-kind={kind}>
          <dt>{LABELS[kind]}</dt>
          {points[kind].map((point) => (
            <dd key={point}>{point}</dd>
          ))}
        </div>
      ))}
    </dl>
  );
}

export function KeyPointsSettingsRow() {
  const [enabled, setEnabled] = useKeyPointsEnabled();
  return (
    <SettingsRow
      id="fork-key-points"
      title="Key points card"
      description="A cheap model lists the questions, main result and warnings under each finished reply. Uses the text generation model, once per reply."
      resetAction={
        enabled !== DEFAULT_ENABLED ? (
          <SettingResetButton label="key points" onClick={() => setEnabled(DEFAULT_ENABLED)} />
        ) : null
      }
      control={
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => setEnabled(Boolean(checked))}
          aria-label="Key points card"
        />
      }
    />
  );
}
