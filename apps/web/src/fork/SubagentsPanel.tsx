import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  projectedSubagentsToRuntime,
  type RuntimeSubagent,
} from "@t3tools/client-runtime/state/subagentRuntime";
import { formatSubagentDisplayTitle } from "@t3tools/client-runtime/state/subagent-display";
import { isOrchestrationV2WorkActive, type ScopedThreadRef } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { CornerLeftUpIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { AgentElapsed } from "../components/chat/AgentElapsed";
import { SubagentTooltipContent } from "../components/chat/SubagentTooltipContent";
import { ThreadDetailsControl } from "../components/chat/ThreadDetailsControl";
import {
  ThreadRelationshipIcon,
  threadRelationshipStatusLabel,
} from "../components/chat/ThreadRelationshipIcon";
import { ThreadHoverCardPopup } from "../components/ThreadHoverCard";
import { Input } from "../components/ui/input";
import { ScrollArea } from "../components/ui/scroll-area";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { useRightPanelStore } from "../rightPanelStore";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { useQuietThreadProjection, useThreadRelationshipShells } from "../state/entities";
import { useEnvironment, useEnvironmentProviders } from "../state/environments";
import { useEnvironmentQuery } from "../state/query";
import { threadFamilies } from "../state/threads";
import { buildThreadRouteParams } from "../threadRoutes";
import {
  delegatingThreadRef,
  filterSubagentRowsByTitle,
  t3SubagentRows,
  type T3SubagentRow,
} from "./threadSubagents";

// The control's press scale moves rows this wide too far.
const ROW_WITHOUT_PRESS_SCALE = "[&:active:not([aria-haspopup])]:scale-100";

/** Fork: the right-panel tab listing the T3 subagents a thread delegated. */
export function SubagentsPanel({ threadRef }: { threadRef: ScopedThreadRef }) {
  const navigate = useNavigate();
  const [titleQuery, setTitleQuery] = useState("");
  const current = useQuietThreadProjection(threadRef)?.projection ?? null;
  const parentRef = current === null ? null : delegatingThreadRef(threadRef, current.thread);
  const parent = useQuietThreadProjection(parentRef)?.projection ?? null;
  const currentShells = useThreadRelationshipShells(threadRef);
  const parentShells = useThreadRelationshipShells(parentRef ?? threadRef);
  const family = useEnvironmentQuery(
    threadFamilies.familyAtom(threadRef.environmentId, threadRef.threadId),
  );

  const { environmentId, threadId } = threadRef;
  const parentEnvironmentId = parentRef?.environmentId ?? null;
  const parentThreadId = parentRef?.threadId ?? null;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- merges these threads' idle subagents, which the shell stream omits, into the thread rows while the tab is open
  useEffect(() => {
    const release = threadFamilies.mount(appAtomRegistry, environmentId, threadId);
    const releaseParent =
      parentEnvironmentId === null || parentThreadId === null
        ? null
        : threadFamilies.mount(appAtomRegistry, parentEnvironmentId, parentThreadId);
    return () => {
      release();
      releaseParent?.();
    };
  }, [environmentId, threadId, parentEnvironmentId, parentThreadId]);

  // Opening a subagent keeps this tab, so its own panel lists its siblings to switch between.
  const currentRows = t3SubagentRows({
    threadId: threadRef.threadId,
    shells: currentShells,
    subagents: current?.subagents ?? [],
  });
  const parentRows =
    parentRef === null
      ? []
      : t3SubagentRows({
          threadId: parentRef.threadId,
          shells: parentShells,
          subagents: parent?.subagents ?? [],
        });
  const showsParentRows = currentRows.length === 0 && parentRef !== null;
  const rows = showsParentRows ? parentRows : currentRows;
  const visibleRows = filterSubagentRowsByTitle(rows, titleQuery);
  const listOwner = showsParentRows ? parent : current;
  const runtimeById = new Map(
    projectedSubagentsToRuntime(listOwner?.subagents ?? []).map((agent) => [agent.id, agent]),
  );
  const runningCount = rows.filter((row) => isOrchestrationV2WorkActive(row.status)).length;
  const parentTitle = parent?.thread.title ?? current?.thread.delegatedFrom?.title ?? null;

  const open = (target: ScopedThreadRef) => {
    useRightPanelStore.getState().open(target, "subagents");
    void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(target) });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
        <span className="font-medium text-foreground">Subagents</span>
        <span className="text-muted-foreground tabular-nums">
          {visibleRows.length !== rows.length
            ? `${visibleRows.length} of ${rows.length}`
            : runningCount > 0
              ? `${rows.length} · ${runningCount} running`
              : rows.length}
        </span>
      </div>
      {rows.length === 0 ? null : (
        <div className="border-b p-1.5">
          <Input
            type="search"
            size="sm"
            aria-label="Filter subagents by title"
            placeholder="Filter by title"
            value={titleQuery}
            onChange={(event) => setTitleQuery(event.currentTarget.value)}
          />
        </div>
      )}
      <ScrollArea className="min-h-0 flex-1">
        <ul className="flex flex-col gap-px p-1.5">
          {parentRef === null ? null : (
            <li className="flex h-8 items-center rounded-lg">
              <ThreadDetailsControl
                size="sm"
                variant="ghost"
                part="row"
                className={ROW_WITHOUT_PRESS_SCALE}
                onClick={() => open(parentRef)}
              >
                <ThreadRelationshipIcon fallbackIcon={CornerLeftUpIcon} status={null} />
                <span className="min-w-0 flex-1 truncate text-left text-sm font-medium leading-4 text-foreground/85">
                  {parentTitle ?? "Parent thread"}
                </span>
              </ThreadDetailsControl>
            </li>
          )}
          {visibleRows.map((row) => (
            <SubagentRow
              key={row.key}
              row={row}
              runtime={row.agent === null ? undefined : runtimeById.get(row.agent.id)}
              ownerEnvironmentId={(showsParentRows ? parentRef : threadRef).environmentId}
              currentThreadKey={scopedThreadKey(threadRef)}
              onOpen={open}
            />
          ))}
        </ul>
        {rows.length > 0 && visibleRows.length === 0 ? (
          <p className="px-4 py-2 text-sm text-muted-foreground">No subagents match that title.</p>
        ) : null}
        {rows.length === 0 && family.data !== null ? (
          <p className="px-4 py-2 text-sm text-muted-foreground">
            This thread hasn't delegated to a subagent.
          </p>
        ) : null}
        {rows.length === 0 && family.data === null && family.error !== null ? (
          <p className="px-4 py-2 text-sm text-muted-foreground">Couldn't load subagents.</p>
        ) : null}
      </ScrollArea>
    </div>
  );
}

function SubagentRow(props: {
  row: T3SubagentRow;
  runtime: RuntimeSubagent | undefined;
  ownerEnvironmentId: ScopedThreadRef["environmentId"];
  currentThreadKey: string;
  onOpen: (target: ScopedThreadRef) => void;
}) {
  const { row, runtime } = props;
  const { agent, shell, status } = row;
  const remote = agent?.remoteChild;
  const environmentId = remote?.environmentId ?? props.ownerEnvironmentId;
  const childThreadId = remote?.threadId ?? shell?.id ?? agent?.childThreadId ?? null;
  const target = childThreadId === null ? null : scopeThreadRef(environmentId, childThreadId);
  // A linked environment this client isn't connected to has nothing to open.
  const remoteEnvironment = useEnvironment(remote?.environmentId ?? null);
  const openable = target !== null && (remote === undefined || remoteEnvironment !== null);
  const providerInstanceId = agent?.providerInstanceId ?? shell!.providerInstanceId;
  const providers = useEnvironmentProviders().get(environmentId);
  const provider = providers?.find((entry) => entry.instanceId === providerInstanceId);
  const title = formatSubagentDisplayTitle(row.title);
  const failed = status === "failed";
  const driver = remote === undefined ? (agent?.driver ?? provider?.driver) : provider?.driver;

  return (
    <li className="flex h-8 items-center rounded-lg has-aria-[current=true]:bg-accent">
      <Tooltip>
        <TooltipTrigger
          delay={200}
          render={
            <ThreadDetailsControl
              size="sm"
              variant="ghost"
              part="row"
              className={ROW_WITHOUT_PRESS_SCALE}
              disabled={!openable}
              aria-current={
                target !== null && scopedThreadKey(target) === props.currentThreadKey
                  ? "true"
                  : undefined
              }
              onClick={() => {
                if (openable) props.onOpen(target);
              }}
            />
          }
        >
          <ThreadRelationshipIcon driver={driver} provider={provider} status={status} />
          <span className="min-w-0 flex-1 truncate text-left text-sm font-medium leading-4 text-foreground/85">
            {title}
          </span>
          <span
            className={`shrink-0 text-2xs tabular-nums ${failed ? "text-destructive" : "text-muted-foreground"}`}
          >
            {remote === undefined ? null : `on ${remote.label} · `}
            {row.startedAt !== null && !failed ? (
              <AgentElapsed agent={row} compact />
            ) : (
              threadRelationshipStatusLabel(status)
            )}
          </span>
        </TooltipTrigger>
        {remote !== undefined ? (
          <TooltipPopup side="left">
            {remoteEnvironment === null
              ? `Runs on ${remote.label}. Connect to it to open the thread there.`
              : `Open on ${remote.label}`}
          </TooltipPopup>
        ) : (
          <ThreadHoverCardPopup side="left">
            <SubagentTooltipContent
              title={title}
              model={runtime?.model ?? shell?.modelSelection.model ?? null}
              providerInstanceId={providerInstanceId}
              origin="app_owned"
              modelSelection={agent?.modelSelection ?? shell?.modelSelection}
              provider={provider}
              providers={providers}
              driver={driver}
              childThread={shell ?? undefined}
              elapsed={<AgentElapsed agent={row} />}
              status={status}
              result={runtime?.result}
              progress={runtime?.progress}
            />
          </ThreadHoverCardPopup>
        )}
      </Tooltip>
    </li>
  );
}
