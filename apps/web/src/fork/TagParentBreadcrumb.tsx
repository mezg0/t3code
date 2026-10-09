import { parseScopedThreadKey, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { CornerLeftUpIcon } from "lucide-react";

import {
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
  WorkspaceBreadcrumbText,
} from "../components/WorkspaceBreadcrumb";
import { useThreadShell } from "../state/entities";
import { buildThreadRouteParams } from "../threadRoutes";
import { tagOwnerKeyForTitle, useThreadTagsStore } from "./threadTags";

/**
 * Fork: in a thread whose title starts with another thread's tag, a header
 * crumb back to that thread, between the project and the title.
 */
export function TagParentBreadcrumb(props: { threadRef: ScopedThreadRef; title: string }) {
  const navigate = useNavigate();
  const tagsByThreadKey = useThreadTagsStore((state) => state.tagsByThreadKey);
  const ownerKey = tagOwnerKeyForTitle(
    props.title,
    scopedThreadKey(props.threadRef),
    tagsByThreadKey,
  );
  const ownerRef = ownerKey === null ? null : parseScopedThreadKey(ownerKey);
  const owner = useThreadShell(ownerRef);
  if (ownerRef === null || owner === null || owner.archivedAt !== null) return null;

  return (
    <>
      <WorkspaceBreadcrumbItem className="shrink">
        <button
          type="button"
          aria-label={`Back to ${owner.title}`}
          onClick={() =>
            void navigate({
              to: "/$environmentId/$threadId",
              params: buildThreadRouteParams(ownerRef),
            })
          }
          className="inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CornerLeftUpIcon aria-hidden className="size-3.5 shrink-0" />
          <WorkspaceBreadcrumbText className="max-w-40">{owner.title}</WorkspaceBreadcrumbText>
        </button>
      </WorkspaceBreadcrumbItem>
      <WorkspaceBreadcrumbSeparator>
        <WorkspaceBreadcrumbText>/</WorkspaceBreadcrumbText>
      </WorkspaceBreadcrumbSeparator>
    </>
  );
}
