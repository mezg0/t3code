import { threadRuntimeIsActive } from "@t3tools/client-runtime/state/models";
import type { PullRequestListEntry, PullRequestListInput } from "@t3tools/contracts";
import { CircleAlertIcon, CircleCheckIcon, CircleDashedIcon, ExternalLinkIcon } from "lucide-react";
import { useMemo } from "react";

import { ProjectFavicon } from "../components/ProjectFavicon";
import { filterSidebarV2VisibleThreads } from "../components/Sidebar.logic";
import { ScrollArea } from "../components/ui/scroll-area";
import { SidebarInset } from "../components/ui/sidebar";
import { WorkspaceBreadcrumb, WorkspaceBreadcrumbItem } from "../components/WorkspaceBreadcrumb";
import { WorkspacePageContainer } from "../components/WorkspacePageContainer";
import { WorkspacePageHeader } from "../components/WorkspacePageHeader";
import { isElectron } from "../env";
import { cn } from "../lib/utils";
import { useProjects, useThreadShells } from "../state/entities";
import { useEnvironments } from "../state/environments";
import { usePullRequestList } from "../state/pullRequests";
import { useUiStateStore } from "../uiStateStore";
import {
  buildOverviewGroups,
  countThreadsByProject,
  type OverviewGroup,
  type ThreadCounts,
} from "./overview";
import { projectGroupScopeKey, useProjectGroupsStore } from "./projectGroups";
import { ProjectGroupIcon } from "./ProjectGroupsMenu";

/** Fork: one page answering "what's going on?" across every project. */
export function OverviewPage() {
  const projects = useProjects();
  const threads = useThreadShells();
  const savedGroups = useProjectGroupsStore((state) => state.groups);
  const groups = useMemo(
    () =>
      buildOverviewGroups({
        groups: savedGroups,
        projects,
        projectKey: (project) => `${project.environmentId}:${project.id}`,
        counts: countThreadsByProject(
          filterSidebarV2VisibleThreads(threads, null).map((thread) => ({
            projectKey: `${thread.environmentId}:${thread.projectId}`,
            working: threadRuntimeIsActive(thread.runtime),
            needsYou: thread.hasPendingApprovals || thread.hasPendingUserInput,
            settled: thread.settledOverride === "settled",
          })),
        ),
      }),
    [projects, savedGroups, threads],
  );

  return (
    <SidebarInset className="isolate h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        <WorkspacePageHeader electron={isElectron} className="h-auto">
          <div className="flex w-full min-w-0 items-center py-2">
            <WorkspaceBreadcrumb ariaLabel="Overview breadcrumb">
              <WorkspaceBreadcrumbItem current>
                <h1>Overview</h1>
              </WorkspaceBreadcrumbItem>
            </WorkspaceBreadcrumb>
          </div>
        </WorkspacePageHeader>
        <ScrollArea className="min-h-0 flex-1">
          <WorkspacePageContainer width="wide" className="flex flex-col gap-8">
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">Projects</h2>
              {groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active threads.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {groups.map((group) => (
                    <GroupCard key={group.groupId ?? "other"} group={group} />
                  ))}
                </div>
              )}
            </section>
            <PullRequestsSection />
          </WorkspacePageContainer>
        </ScrollArea>
      </div>
    </SidebarInset>
  );
}

function CountsLine(props: { counts: ThreadCounts; className?: string }) {
  const { working, needsYou, active } = props.counts;
  return (
    <span className={cn("flex items-center gap-2 text-xs tabular-nums", props.className)}>
      {needsYou > 0 ? <span className="text-warning-foreground">{needsYou} need you</span> : null}
      {working > 0 ? <span className="text-foreground">{working} working</span> : null}
      <span className="text-muted-foreground">{active} active</span>
    </span>
  );
}

type OverviewProject = ReturnType<typeof useProjects>[number];

function GroupCard(props: { group: OverviewGroup<OverviewProject> }) {
  const { group } = props;
  const setProjectScopeKey = useUiStateStore((store) => store.setSidebarProjectScopeKey);
  return (
    <button
      type="button"
      // Filters the sidebar beside the page to this group's threads.
      onClick={() => setProjectScopeKey(group.groupId ? projectGroupScopeKey(group.groupId) : null)}
      className="flex cursor-pointer flex-col gap-3 rounded-lg border bg-card p-4 text-left hover:bg-accent/40"
    >
      <span className="flex items-center gap-2">
        <ProjectGroupIcon icon={group.icon} className="size-4" />
        <span className="min-w-0 flex-1 truncate font-medium">{group.name}</span>
        {group.totals.working > 0 ? (
          <span className="flex items-center gap-1 text-xs text-foreground tabular-nums">
            <CircleDashedIcon className="size-3.5" />
            {group.totals.working}
          </span>
        ) : null}
      </span>
      <CountsLine counts={group.totals} />
      <ul className="flex flex-col gap-1.5 border-t pt-3">
        {group.projects.map(({ project, counts }) => (
          <li key={`${project.environmentId}:${project.id}`} className="flex items-center gap-2">
            <ProjectFavicon project={project} className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-sm">{project.title}</span>
            <CountsLine counts={counts} className="shrink-0" />
          </li>
        ))}
      </ul>
    </button>
  );
}

const PR_LIMIT = 20;

function PullRequestsSection() {
  const { environments } = useEnvironments();
  // Same environments the Pull Requests page asks: those whose server lists pull requests.
  const targets = useMemo(() => {
    const environmentIds = environments
      .filter((environment) => environment.serverConfig?.environment.capabilities.pullRequests)
      .map((environment) => environment.environmentId);
    const targetsFor = (involvement: "reviewing" | "authored") =>
      environmentIds.map((environmentId) => ({
        environmentId,
        input: { state: "open", involvement, limit: PR_LIMIT } satisfies PullRequestListInput,
      }));
    return { reviewing: targetsFor("reviewing"), authored: targetsFor("authored") };
  }, [environments]);
  const reviewing = usePullRequestList(targets.reviewing);
  const authored = usePullRequestList(targets.authored);
  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <PullRequestList
        title="Waiting for your review"
        empty="Nothing to review."
        view={reviewing}
      />
      <PullRequestList
        title="Your open pull requests"
        empty="No open pull requests."
        view={authored}
      />
    </section>
  );
}

function PullRequestList(props: {
  title: string;
  empty: string;
  view: ReturnType<typeof usePullRequestList>;
}) {
  const entries = props.view.data?.entries ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">
        {props.title}
        {entries.length > 0 ? <span className="ml-1.5 tabular-nums">{entries.length}</span> : null}
      </h2>
      {props.view.isPending && entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : props.view.error && entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Couldn't load pull requests.</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{props.empty}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border bg-card">
          {entries.map((entry) => (
            <li key={`${entry.environmentId}:${entry.url}`}>
              <PullRequestRow entry={entry} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PullRequestRow(props: { entry: PullRequestListEntry }) {
  const { entry } = props;
  return (
    <a
      href={entry.url}
      target="_blank"
      rel="noreferrer"
      className="group/pr flex items-center gap-3 px-3 py-2.5 hover:bg-accent/40"
    >
      <ChecksIcon state={entry.checksState} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{entry.title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {entry.projectTitle} #{entry.number}
          {entry.author ? ` · ${entry.author.login}` : ""}
          {entry.isDraft ? " · draft" : ""}
        </span>
      </span>
      <ReviewBadge decision={entry.reviewDecision} />
      <ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover/pr:opacity-100" />
    </a>
  );
}

function ChecksIcon(props: { state: PullRequestListEntry["checksState"] }) {
  if (props.state === "failing") {
    return (
      <CircleAlertIcon aria-label="Checks failing" className="size-4 shrink-0 text-destructive" />
    );
  }
  if (props.state === "passing") {
    return <CircleCheckIcon aria-label="Checks passing" className="size-4 shrink-0 text-success" />;
  }
  return (
    <CircleDashedIcon
      aria-label="Checks pending"
      className="size-4 shrink-0 text-muted-foreground"
    />
  );
}

function ReviewBadge(props: { decision: PullRequestListEntry["reviewDecision"] }) {
  if (props.decision === "approved") {
    return <span className="shrink-0 text-xs text-success">Approved</span>;
  }
  if (props.decision === "changes-requested") {
    return <span className="shrink-0 text-xs text-warning-foreground">Changes requested</span>;
  }
  return null;
}
