import { postProcessEnvironmentTranscript } from "@t3tools/client-runtime/voice-input";
import type { EnvironmentId } from "@t3tools/contracts";
import { THREAD_FIND_BLOCK_TAGS } from "@t3tools/shared/threadFindText";
import * as Schema from "effect/Schema";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { SettingResetButton, SettingsRow } from "../components/settings/settingsLayout";
import { Switch } from "../components/ui/switch";
import { useLocalStorage, writeLocalStorageValue } from "../hooks/useLocalStorage";
import { runEnvironmentSpeech } from "../speech/runEnvironmentSpeech";
import { readPreparedConnection } from "../state/session";
import {
  KEY_POINT_KINDS,
  KEY_POINTS_INSTRUCTIONS,
  type KeyPointKind,
  type KeyPoints,
  locateKeyPoints,
  parseKeyPoints,
} from "./keyPointsLogic";

// Fork: per-device, kept out of the synced settings schema so the stock server never sees it.
const ENABLED_KEY = "t3fork:key-points:enabled";
const CACHE_KEY = "t3fork:key-points:cache:v1";
const DEFAULT_ENABLED = true;
/** Shorter replies are quick to read in full. */
const MIN_REPLY_LENGTH = 600;
const MAX_REPLY_LENGTH = 60_000;
const MAX_CACHED_REPLIES = 150;

const Quotes = Schema.Array(Schema.String);
const KeyPointsCache = Schema.Record(
  Schema.String,
  Schema.Struct({ ask: Quotes, key: Quotes, watch: Quotes }),
);
type KeyPointsCache = typeof KeyPointsCache.Type;
const EMPTY_CACHE: KeyPointsCache = {};

const LABELS: Record<KeyPointKind, readonly [one: string, many: string]> = {
  ask: ["question", "questions"],
  key: ["key point", "key points"],
  watch: ["to watch", "to watch"],
};

function useKeyPointsEnabled() {
  return useLocalStorage(ENABLED_KEY, DEFAULT_ENABLED, Schema.Boolean);
}

interface ReplyText {
  /** Whitespace collapsed and quote marks straightened, as `normalizeForMatch` leaves it. */
  readonly text: string;
  /** The DOM position of each character; null for the space added between blocks. */
  readonly positions: ReadonlyArray<{ readonly node: Text; readonly offset: number } | null>;
}

function readReplyText(root: HTMLElement): ReplyText {
  let text = "";
  const positions: Array<{ node: Text; offset: number } | null> = [];
  const breakBlock = () => {
    if (text.length > 0 && !text.endsWith(" ")) {
      text += " ";
      positions.push(null);
    }
  };
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.nodeValue ?? "";
      for (let offset = 0; offset < value.length; offset++) {
        let char = value[offset]!;
        if (/\s/.test(char)) {
          if (text.length === 0 || text.endsWith(" ")) continue;
          char = " ";
        } else if (char === "‘" || char === "’") char = "'";
        else if (char === "“" || char === "”") char = '"';
        text += char;
        positions.push({ node: node as Text, offset });
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    // Code and controls are never worth a highlight, and quoting them is unreliable.
    if (element.matches('svg, pre, button, [role="toolbar"], [data-thread-find-ignore]')) {
      breakBlock();
      return;
    }
    const block = THREAD_FIND_BLOCK_TAGS.has(element.tagName.toLowerCase());
    if (block) breakBlock();
    for (const child of element.childNodes) visit(child);
    if (block) breakBlock();
  };
  visit(root);
  return { text, positions };
}

const pending = new Set<string>();
let queue: Promise<void> = Promise.resolve();

/** One request at a time, once per reply for this page load. Failures stay quiet. */
function requestKeyPoints(environmentId: EnvironmentId, messageId: string, text: string) {
  if (pending.has(messageId)) return;
  pending.add(messageId);
  queue = queue.then(async () => {
    const prepared = readPreparedConnection(environmentId);
    if (!prepared) {
      pending.delete(messageId);
      return;
    }
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
      const points = parseKeyPoints(result.text);
      if (!points) return;
      writeLocalStorageValue(
        CACHE_KEY,
        (cache) => {
          const entries = Object.entries({ ...cache, [messageId]: points });
          return Object.fromEntries(entries.slice(-MAX_CACHED_REPLIES));
        },
        EMPTY_CACHE,
        KeyPointsCache,
      );
    } catch {
      // No highlights is the fallback; the reply itself is untouched.
    }
  });
}

type KindRanges = Record<KeyPointKind, Range[]>;
const painted = new Map<symbol, KindRanges>();

function repaint() {
  if (typeof CSS === "undefined" || !CSS.highlights || typeof Highlight === "undefined") return;
  for (const kind of KEY_POINT_KINDS) {
    const ranges = [...painted.values()].flatMap((owner) => owner[kind]);
    if (ranges.length === 0) CSS.highlights.delete(`t3-fork-key-point-${kind}`);
    else CSS.highlights.set(`t3-fork-key-point-${kind}`, new Highlight(...ranges));
  }
}

function buildRanges(root: HTMLElement, points: KeyPoints): KindRanges {
  const ranges: KindRanges = { ask: [], key: [], watch: [] };
  const { text, positions } = readReplyText(root);
  for (const span of locateKeyPoints(text, points)) {
    const start = positions.slice(span.start, span.end).find((position) => position !== null);
    const end = positions.slice(span.start, span.end).findLast((position) => position !== null);
    if (!start || !end) continue;
    const range = root.ownerDocument.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset + 1);
    ranges[span.kind].push(range);
  }
  return ranges;
}

/**
 * Wraps a finished assistant reply. `generate` marks the reply worth asking the
 * model about (the latest finished one); cached highlights paint for any reply.
 */
export function KeyPointHighlights(props: {
  readonly messageId: string;
  readonly environmentId: EnvironmentId;
  readonly settled: boolean;
  readonly generate: boolean;
  readonly children: ReactNode;
}) {
  const { messageId, environmentId, settled, generate } = props;
  const [enabled] = useKeyPointsEnabled();
  const [cache] = useLocalStorage(CACHE_KEY, EMPTY_CACHE, KeyPointsCache);
  const points = enabled && settled ? cache[messageId] : undefined;
  const rootRef = useRef<HTMLDivElement>(null);
  const rangesRef = useRef<KindRanges | null>(null);
  const [counts, setCounts] = useState<Record<KeyPointKind, number> | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- asks the model once the finished reply's rendered text exists in the DOM
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled || !settled || !generate || points) return;
    const { text } = readReplyText(root);
    if (text.length < MIN_REPLY_LENGTH) return;
    requestKeyPoints(environmentId, messageId, text.slice(0, MAX_REPLY_LENGTH));
  }, [enabled, settled, generate, points, environmentId, messageId]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- paints CSS Highlight ranges over the rendered reply, rebuilding them when its DOM changes, and clears them on cleanup
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !points) return;
    const owner = Symbol(messageId);
    const paint = () => {
      const ranges = buildRanges(root, points);
      rangesRef.current = ranges;
      painted.set(owner, ranges);
      repaint();
      setCounts((current) => {
        const next = { ask: ranges.ask.length, key: ranges.key.length, watch: ranges.watch.length };
        return current && KEY_POINT_KINDS.every((kind) => current[kind] === next[kind])
          ? current
          : next;
      });
    };
    paint();
    const observer = new MutationObserver(paint);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      rangesRef.current = null;
      painted.delete(owner);
      repaint();
      setCounts(null);
    };
  }, [points, messageId]);

  const shown = counts ? KEY_POINT_KINDS.filter((kind) => counts[kind] > 0) : [];

  return (
    <>
      {counts && shown.length > 0 ? (
        <div className="fork-key-points-legend" data-thread-find-ignore>
          {shown.map((kind) => (
            <button
              key={kind}
              type="button"
              data-kind={kind}
              onClick={() =>
                rangesRef.current?.[kind][0]?.startContainer.parentElement?.scrollIntoView({
                  block: "center",
                  behavior: "smooth",
                })
              }
            >
              {counts[kind]} {LABELS[kind][counts[kind] === 1 ? 0 : 1]}
            </button>
          ))}
        </div>
      ) : null}
      <div ref={rootRef}>{props.children}</div>
    </>
  );
}

export function KeyPointsSettingsRow() {
  const [enabled, setEnabled] = useKeyPointsEnabled();
  return (
    <SettingsRow
      id="fork-key-points"
      title="Highlight key points"
      description="A cheap model marks the questions, key results and warnings in each finished reply. Uses the text generation model, once per reply."
      resetAction={
        enabled !== DEFAULT_ENABLED ? (
          <SettingResetButton label="key points" onClick={() => setEnabled(DEFAULT_ENABLED)} />
        ) : null
      }
      control={
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => setEnabled(Boolean(checked))}
          aria-label="Highlight key points"
        />
      }
    />
  );
}
