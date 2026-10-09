import {
  parseScopedThreadKey,
  scopedThreadKey,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import { effectiveSnoozed, threadWokeAt } from "@t3tools/client-runtime/state/thread-settled";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { PencilIcon, XIcon } from "lucide-react";
import { useCallback, useMemo, useState, type FormEvent, type MouseEvent } from "react";

import { useAtomValue } from "@effect/atom-react";

import { SidebarThreadRow } from "../components/Sidebar";
import {
  setThreadChangeRequestSnapshot,
  threadChangeRequestSnapshotsAtom,
} from "../components/ThreadStatusIndicators";
import {
  isSidebarNestedLinkClick,
  isTrailingDoubleClick,
  resolveSidebarThreadStatus,
  type SidebarThreadStatus,
} from "../components/Sidebar.logic";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { ScrollArea } from "../components/ui/scroll-area";
import { toastManager } from "../components/ui/toast";
import { useClientSettings } from "../hooks/useSettings";
import { useAcknowledgeThreadWoke, useThreadActions } from "../hooks/useThreadActions";
import { deriveProviderEntriesByEnvironment } from "../providerInstances";
import { useProjects, useServerConfigs, useThreadShell, useThreadShells } from "../state/entities";
import {
  useEnvironmentIdentities,
  useEnvironmentMachines,
  usePrimaryEnvironmentId,
} from "../state/environments";
import { buildThreadRouteParams } from "../threadRoutes";
import {
  normalizeThreadTag,
  parseTitleTag,
  threadsWithTag,
  threadTagKey,
  useThreadTagsStore,
} from "./threadTags";

// Threads waiting on Brandon first, then running work, then the rest.
const STATUS_ORDER: Record<SidebarThreadStatus, number> = {
  approval: 0,
  input: 0,
  failed: 1,
  limited: 1,
  working: 2,
  waiting: 3,
  ready: 4,
};

const EMPTY_PROVIDER_ENTRIES = new Map();
const noop = () => {};

/** Fork: the right-panel tab listing the threads that belong to this thread's tag. */
export function TaggedThreadsPanel({ threadRef }: { threadRef: ScopedThreadRef }) {
  const ownerKey = scopedThreadKey(threadRef);
  const tag = useThreadTagsStore((state) => state.tagsByThreadKey[ownerKey] ?? null);
  const [editing, setEditing] = useState(false);

  if (tag === null || editing) {
    return (
      <TagForm
        ownerKey={ownerKey}
        initialTag={tag}
        onDone={() => setEditing(false)}
        onCancel={tag === null ? null : () => setEditing(false)}
      />
    );
  }
  return <TaggedThreadList ownerKey={ownerKey} tag={tag} onEdit={() => setEditing(true)} />;
}

function TagForm(props: {
  ownerKey: string;
  initialTag: string | null;
  onDone: () => void;
  onCancel: (() => void) | null;
}) {
  const setThreadTag = useThreadTagsStore((state) => state.setThreadTag);
  const tagsByThreadKey = useThreadTagsStore((state) => state.tagsByThreadKey);
  const [value, setValue] = useState(props.initialTag ?? "");
  const tag = normalizeThreadTag(value);
  // One owner per tag, or two panels and breadcrumbs would fight over its threads.
  const takenByKey =
    tag === null
      ? null
      : (Object.entries(tagsByThreadKey).find(
          ([threadKey, owned]) =>
            threadKey !== props.ownerKey && threadTagKey(owned) === threadTagKey(tag),
        )?.[0] ?? null);
  const takenBy = useThreadShell(takenByKey === null ? null : parseScopedThreadKey(takenByKey));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (tag === null || takenBy !== null) return;
    setThreadTag(props.ownerKey, tag);
    props.onDone();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 p-4 text-sm">
      <p className="text-muted-foreground">
        Threads whose titles start with{" "}
        <code className="text-foreground">{`{{${tag ?? "TAG"}}}`}</code> are listed here and link
        back to this thread.
      </p>
      <Input
        autoFocus
        size="sm"
        aria-label="Tag"
        placeholder="SENTRY"
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
      />
      {takenBy ? (
        <p className="text-xs text-destructive-foreground">
          {takenBy.title} already uses this tag. Remove it there first.
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        {props.onCancel ? (
          <Button type="button" size="xs" variant="ghost" onClick={props.onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" size="xs" disabled={tag === null || takenBy !== null}>
          Set tag
        </Button>
      </div>
    </form>
  );
}

function TaggedThreadList(props: { ownerKey: string; tag: string; onEdit: () => void }) {
  const shells = useThreadShells();
  const setThreadTag = useThreadTagsStore((state) => state.setThreadTag);
  const rowProps = useSidebarRowProps();

  const tagged = useMemo(() => {
    const keyed = shells.map((shell) => ({
      // The tag is the panel's heading, so rows show the rest of the title.
      shell: { ...shell, title: parseTitleTag(shell.title)?.rest ?? shell.title },
      key: scopedThreadKey(scopeThreadRef(shell.environmentId, shell.id)),
      title: shell.title,
      archivedAt: shell.archivedAt,
      deletedAt: shell.deletedAt,
      status: resolveSidebarThreadStatus(shell),
      settled: shell.settledOverride === "settled",
    }));
    return threadsWithTag(keyed, props.tag, props.ownerKey).toSorted(
      (left, right) =>
        Number(left.settled) - Number(right.settled) ||
        STATUS_ORDER[left.status] - STATUS_ORDER[right.status] ||
        right.shell.createdAt.localeCompare(left.shell.createdAt),
    );
  }, [props.ownerKey, props.tag, shells]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
        <code className="min-w-0 truncate font-medium text-foreground">{`{{${props.tag}}}`}</code>
        <span className="text-muted-foreground tabular-nums">{tagged.length}</span>
        <span className="flex-1" />
        <Button size="icon-xs" variant="ghost-muted" aria-label="Change tag" onClick={props.onEdit}>
          <PencilIcon />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost-destructive"
          aria-label="Remove tag"
          onClick={() => setThreadTag(props.ownerKey, null)}
        >
          <XIcon />
        </Button>
      </div>
      {tagged.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          No threads start with <code className="text-foreground">{`{{${props.tag}}}`}</code> yet.
        </p>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <ul className="flex flex-col gap-px p-1.5">
            {tagged.map(({ shell, key }) => {
              const snoozed = effectiveSnoozed(shell, { now: rowProps.now });
              const settled = shell.settledOverride === "settled";
              return (
                <SidebarThreadRow
                  key={key}
                  thread={shell}
                  variant={snoozed || settled ? "slim" : "card"}
                  variantAction={snoozed ? "unsnooze" : settled ? "unsettle" : "settle"}
                  isPinned={shell.pinnedAt != null}
                  wokeAt={threadWokeAt(shell, { now: rowProps.now })}
                  environmentLabel={rowProps.environmentLabelById.get(shell.environmentId) ?? null}
                  environmentMachine={
                    rowProps.environmentMachineById.get(shell.environmentId) ?? "server"
                  }
                  project={
                    rowProps.projectByKey.get(`${shell.environmentId}:${shell.projectId}`) ?? null
                  }
                  projectDisplayName={
                    rowProps.projectByKey.get(`${shell.environmentId}:${shell.projectId}`)?.title ??
                    null
                  }
                  providerEntryByInstanceId={
                    rowProps.providerEntriesByEnvironment.get(shell.environmentId) ??
                    EMPTY_PROVIDER_ENTRIES
                  }
                  {...rowProps.capabilities(shell.environmentId)}
                  changeRequestSnapshot={rowProps.changeRequestSnapshots.get(key) ?? null}
                  {...rowProps.shared}
                />
              );
            })}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}

/**
 * The parts of a sidebar row's props that don't depend on the thread. Rows here
 * open their thread and keep Settle, Snooze and Unpin; dragging, sweeps, inline
 * rename and the context menu stay in the sidebar.
 */
function useSidebarRowProps() {
  const navigate = useNavigate();
  const projects = useProjects();
  const serverConfigs = useServerConfigs();
  const environments = useEnvironmentIdentities();
  const environmentMachineById = useEnvironmentMachines();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const timestampFormat = useClientSettings((settings) => settings.timestampFormat);
  const acknowledgeWoke = useAcknowledgeThreadWoke();
  const { settleThread, unsettleThread, snoozeThread, unsnoozeThread, confirmAndUnpinThread } =
    useThreadActions();
  const changeRequestSnapshots = useAtomValue(threadChangeRequestSnapshotsAtom);

  const open = useCallback(
    (threadRef: ScopedThreadRef) =>
      void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(threadRef) }),
    [navigate],
  );
  const reportFailure = (title: string) => (result: { _tag: string }) => {
    if (result._tag === "Failure") toastManager.add({ type: "error", title });
  };

  return {
    now: new Date().toISOString(),
    changeRequestSnapshots,
    environmentMachineById,
    environmentLabelById: new Map(
      environments.map((environment) => [environment.environmentId, environment.label] as const),
    ),
    projectByKey: new Map(
      projects.map((project) => [`${project.environmentId}:${project.id}`, project] as const),
    ),
    providerEntriesByEnvironment: deriveProviderEntriesByEnvironment(
      [...serverConfigs].map(
        ([environmentId, config]) => [environmentId, config.providers, config.settings] as const,
      ),
    ),
    capabilities: (environmentId: EnvironmentId) => {
      const capabilities = serverConfigs.get(environmentId)?.environment.capabilities;
      return {
        settlementSupported: capabilities?.threadSettlement === true,
        snoozeSupported: capabilities?.threadSnooze === true,
        pinningSupported: capabilities?.threadPinning === true,
      };
    },
    shared: {
      sortable: undefined,
      dropVerb: null,
      dragOverPinned: false,
      sweepAction: null,
      snoozeWakeLabelText: null,
      isActive: false,
      openPullRequestsInRightPanel: true,
      jumpLabel: null,
      currentEnvironmentId: primaryEnvironmentId,
      scratchMachineLabel: null,
      timestampFormat,
      onThreadClick: (event: MouseEvent, threadRef: ScopedThreadRef) => {
        if (isSidebarNestedLinkClick(event.target) || isTrailingDoubleClick(event.detail)) return;
        open(threadRef);
      },
      onThreadActivate: open,
      onStartRename: noop,
      onRenameTitleChange: noop,
      onCommitRename: noop,
      onCancelRename: noop,
      isRenaming: false,
      renamingTitle: "",
      onContextMenu: noop,
      onActionSweepStart: noop,
      onSettle: (ref: ScopedThreadRef) =>
        void settleThread(ref).then(reportFailure("Failed to settle thread")),
      onUnsettle: (ref: ScopedThreadRef) =>
        void unsettleThread(ref).then(reportFailure("Failed to un-settle thread")),
      onSnooze: (ref: ScopedThreadRef, preset: { snoozedUntil: string }) =>
        void snoozeThread(ref, preset.snoozedUntil).then(reportFailure("Failed to snooze thread")),
      onUnsnooze: (ref: ScopedThreadRef) =>
        void unsnoozeThread(ref).then(reportFailure("Failed to wake thread")),
      onUnpin: (ref: ScopedThreadRef) =>
        void confirmAndUnpinThread(ref).then(reportFailure("Failed to unpin thread")),
      onAcknowledgeWoke: acknowledgeWoke,
      onChangeRequestSnapshot: setThreadChangeRequestSnapshot,
    },
  };
}
