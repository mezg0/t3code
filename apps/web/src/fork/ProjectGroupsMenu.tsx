import type { ScopedProjectRef } from "@t3tools/contracts";
import { LayersIcon, PencilIcon, PlusIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { create } from "zustand";

import { ProjectFavicon, type ProjectFaviconProject } from "../components/ProjectFavicon";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { randomUUID } from "../lib/utils";
import {
  projectEntryMembership,
  setProjectEntryMembership,
  type SavedProjectGroup,
  useProjectGroupsStore,
} from "./projectGroups";

/** A project as the sidebar's filter lists it; clones grouped by repository share one entry. */
export type ProjectGroupEntry = ProjectFaviconProject & {
  readonly projectKey: string;
  readonly displayName: string;
  readonly memberProjectRefs: ReadonlyArray<ScopedProjectRef>;
};

export function projectEntryKeys(entry: Pick<ProjectGroupEntry, "memberProjectRefs">): string[] {
  return entry.memberProjectRefs.map((ref) => `${ref.environmentId}:${ref.projectId}`);
}

// null while closed; "new" or the group being edited while open.
const useDialogTarget = create<{ target: SavedProjectGroup | "new" | null }>(() => ({
  target: null,
}));

export function openProjectGroupDialog(group: SavedProjectGroup | null) {
  useDialogTarget.setState({ target: group ?? "new" });
}

const closeDialog = () => useDialogTarget.setState({ target: null });

export function ProjectGroupDialogHost(props: { projects: readonly ProjectGroupEntry[] }) {
  const target = useDialogTarget((state) => state.target);
  if (target === null) return null;
  return (
    <ProjectGroupDialog
      key={target === "new" ? "new" : target.id}
      group={target === "new" ? null : target}
      projects={props.projects}
    />
  );
}

function ProjectGroupDialog(props: {
  group: SavedProjectGroup | null;
  projects: readonly ProjectGroupEntry[];
}) {
  const id = useId();
  const saveGroup = useProjectGroupsStore((state) => state.saveGroup);
  const deleteGroup = useProjectGroupsStore((state) => state.deleteGroup);
  const [name, setName] = useState(props.group?.name ?? "");
  const [memberKeys, setMemberKeys] = useState<readonly string[]>(props.group?.memberKeys ?? []);
  const members = useMemo(() => new Set(memberKeys), [memberKeys]);
  const canSave = name.trim().length > 0 && memberKeys.length > 0;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closeDialog();
      }}
    >
      <DialogPopup className="sm:max-w-sm">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSave) return;
            saveGroup({
              id: props.group?.id ?? randomUUID(),
              name: name.trim(),
              memberKeys,
            });
            closeDialog();
          }}
        >
          <DialogHeader>
            <DialogTitle>{props.group ? "Edit project group" : "New project group"}</DialogTitle>
            <DialogDescription>Filter the sidebar to these projects in one step.</DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-name`}>Name</Label>
                <Input
                  id={`${id}-name`}
                  autoFocus
                  value={name}
                  placeholder="Sprintlaw"
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Projects</span>
                <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                  {props.projects.map((project) => {
                    const entryKeys = projectEntryKeys(project);
                    const membership = projectEntryMembership(entryKeys, members);
                    return (
                      <li key={project.projectKey}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-accent">
                          <Checkbox
                            checked={membership === "all"}
                            indeterminate={membership === "some"}
                            onCheckedChange={(checked) =>
                              setMemberKeys((current) =>
                                setProjectEntryMembership(current, entryKeys, checked),
                              )
                            }
                          />
                          <ProjectFavicon project={project} className="size-4 shrink-0" />
                          <span className="min-w-0 truncate">{project.displayName}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </DialogPanel>
          <DialogFooter>
            {props.group ? (
              <Button
                type="button"
                variant="ghost-destructive"
                className="sm:me-auto"
                onClick={() => {
                  deleteGroup(props.group!.id);
                  closeDialog();
                }}
              >
                Delete group
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

/** A group's row in the sidebar's project filter, with a button to edit it. */
export function ProjectGroupScopeItemContent(props: { group: SavedProjectGroup }) {
  return (
    <>
      <LayersIcon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-sm">{props.group.name}</span>
      <Button
        size="icon-xs"
        variant="ghost-muted"
        tabIndex={-1}
        aria-hidden="true"
        title={`Edit ${props.group.name}`}
        className="ml-auto"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openProjectGroupDialog(props.group);
        }}
      >
        <PencilIcon className="size-3.5" />
      </Button>
    </>
  );
}

/** Sits under the project filter's list. */
export function NewProjectGroupButton(props: { onOpen: () => void }) {
  return (
    <div className="border-t p-1">
      <Button
        size="sm"
        variant="ghost-muted"
        className="w-full justify-start"
        onClick={() => {
          props.onOpen();
          openProjectGroupDialog(null);
        }}
      >
        <PlusIcon className="size-4" />
        New group…
      </Button>
    </div>
  );
}
