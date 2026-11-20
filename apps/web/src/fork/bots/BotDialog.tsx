import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { canCreateProjectInEnvironment } from "@t3tools/client-runtime/operations/projects";
import { thrownErrorMessage } from "@t3tools/client-runtime/errors";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { type ModelSelection, resolveEnvironmentMachineKind } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useGT, useMessages } from "gt-react";
import { type ChangeEvent, useRef, useState } from "react";

import { EnvironmentMachineIcon } from "../../components/EnvironmentMachineIcon";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { newMessageId, newProjectId, newThreadId } from "../../lib/utils";
import { useProjects } from "../../state/entities";
import {
  useEnvironmentProviders,
  useEnvironments,
  usePrimaryEnvironmentId,
} from "../../state/environments";
import { projectEnvironment } from "../../state/projects";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { buildThreadRouteParams } from "../../threadRoutes";
import { avatarFromFile, BotAvatar } from "./BotAvatar";
import { botSetupPrompt } from "./botSetupPrompt";
import {
  type Bot,
  botThreadKey,
  readLastBotServer,
  rememberBotServer,
  updateBotLog,
  updateBots,
} from "./botStore";

const DEFAULT_MODEL_KEY = "claudeAgent:claude-opus-5-5";

function nowIso(): string {
  return new Date().toISOString();
}

function homeFolderName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "bot" : slug;
}

/** `~/bots/<name>`, numbered when another project already uses that folder. */
function uniqueHomeFolder(name: string, workspaceRoots: ReadonlyArray<string>): string {
  const base = homeFolderName(name);
  const taken = (folder: string) => workspaceRoots.some((root) => root.endsWith(`/bots/${folder}`));
  let folder = base;
  for (let suffix = 2; taken(folder); suffix += 1) folder = `${base}-${suffix}`;
  return `~/bots/${folder}`;
}

/** Creates a bot, or edits one when `bot` is given. */
export function BotDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bot?: Bot;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-sm">
        {props.open ? (
          <BotDialogContent
            {...(props.bot === undefined ? {} : { bot: props.bot })}
            onClose={() => props.onOpenChange(false)}
          />
        ) : null}
      </DialogPopup>
    </Dialog>
  );
}

function BotDialogContent(props: { bot?: Bot; onClose: () => void }) {
  const gt = useGT();
  const m = useMessages();
  const navigate = useNavigate();
  const editing = props.bot;
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const providersByEnvironment = useEnvironmentProviders();
  const projects = useProjects();
  const createProject = useAtomCommand(projectEnvironment.create, { reportFailure: false });
  const startTurn = useOrchestrationCommand(threadEnvironment.startTurn, { reportFailure: false });
  const updateThreadMetadata = useOrchestrationCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(editing?.name ?? "");
  const [avatar, setAvatar] = useState<string | null>(editing?.avatar ?? null);
  const [modelKey, setModelKey] = useState<string | null>(null);
  const [serverId, setServerId] = useState<string | null>(readLastBotServer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const servers = environments
    .filter(
      (environment) =>
        canCreateProjectInEnvironment(environment.connection.phase) &&
        environment.serverConfig !== null,
    )
    .map((environment) => ({
      environmentId: environment.environmentId,
      label: environment.label,
      machine: resolveEnvironmentMachineKind(environment.serverConfig),
    }))
    .toSorted((a, b) => a.label.localeCompare(b.label));
  const server =
    servers.find((candidate) => candidate.environmentId === serverId) ??
    servers.find((candidate) => candidate.environmentId === primaryEnvironmentId) ??
    servers[0];
  const environmentId = server?.environmentId ?? null;
  const models =
    (environmentId === null ? undefined : providersByEnvironment.get(environmentId))
      ?.filter((provider) => provider.enabled && provider.installed)
      .flatMap((provider) =>
        provider.models.map((model) => ({
          key: `${provider.instanceId}:${model.slug}`,
          selection: { instanceId: provider.instanceId, model: model.slug } as ModelSelection,
          label: `${provider.displayName ?? provider.driver} · ${model.name}`,
        })),
      ) ?? [];
  const model =
    models.find((candidate) => candidate.key === modelKey) ??
    models.find((candidate) => candidate.key === DEFAULT_MODEL_KEY) ??
    models[0];
  const trimmedName = name.trim();

  const pickAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;
    try {
      setAvatar(await avatarFromFile(file));
    } catch {
      setError(gt("That image couldn't be read."));
    }
  };

  const save = async () => {
    if (editing === undefined) return;
    setBusy(true);
    if (trimmedName !== editing.name) {
      const result = await updateThreadMetadata({
        environmentId: editing.environmentId,
        input: { threadId: editing.threadId, title: trimmedName },
      });
      if (result._tag === "Failure") {
        setBusy(false);
        setError(thrownErrorMessage(squashAtomCommandFailure(result), m) ?? gt("Rename failed."));
        return;
      }
    }
    updateBots((bots) =>
      bots.map((bot) =>
        bot.environmentId === editing.environmentId && bot.threadId === editing.threadId
          ? { ...bot, name: trimmedName, avatar }
          : bot,
      ),
    );
    props.onClose();
  };

  const create = async () => {
    if (environmentId === null || model === undefined) return;
    setBusy(true);
    setError(null);
    const fail = (cause: unknown, fallback: string) => {
      setBusy(false);
      setError(thrownErrorMessage(cause, m) ?? fallback);
    };
    const projectId = newProjectId();
    const created = await createProject({
      environmentId,
      input: {
        projectId,
        title: trimmedName,
        workspaceRoot: uniqueHomeFolder(
          trimmedName,
          projects
            .filter((project) => project.environmentId === environmentId)
            .map((project) => project.workspaceRoot),
        ),
        createWorkspaceRootIfMissing: true,
        defaultModelSelection: model.selection,
      },
    });
    if (created._tag === "Failure") {
      fail(squashAtomCommandFailure(created), gt("Couldn't create the bot's home folder."));
      return;
    }
    const threadId = newThreadId();
    const setupMessageId = newMessageId();
    const createdAt = nowIso();
    const started = await startTurn({
      environmentId,
      input: {
        threadId,
        message: {
          messageId: setupMessageId,
          role: "user",
          text: botSetupPrompt(trimmedName),
          attachments: [],
        },
        modelSelection: model.selection,
        runtimeMode: "full-access",
        interactionMode: "default",
        bootstrap: {
          createThread: {
            projectId,
            title: trimmedName,
            modelSelection: model.selection,
            runtimeMode: "full-access",
            interactionMode: "default",
            branch: null,
            worktreePath: null,
            createdAt,
          },
        },
        createdAt,
      },
    });
    if (started._tag === "Failure") {
      fail(squashAtomCommandFailure(started), gt("Couldn't start the bot."));
      return;
    }
    rememberBotServer(environmentId);
    updateBots((bots) => [
      ...bots,
      { environmentId, projectId, threadId, setupMessageId, name: trimmedName, avatar },
    ]);
    props.onClose();
    await navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(environmentId, threadId)),
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing === undefined ? gt("New bot") : gt("Edit bot")}</DialogTitle>
        <DialogDescription>
          {editing === undefined
            ? gt("It sets up its own schedule and only messages you when it has something to say.")
            : gt("Ask the bot itself to change what it does or when it wakes up.")}
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            aria-label={gt("Choose a photo")}
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer rounded-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <BotAvatar bot={{ name: trimmedName, avatar }} className="size-16 text-2xl" />
          </button>
          <span className="text-muted-foreground text-xs">
            {avatar === null ? gt("Click to add a photo") : gt("Click to change the photo")}
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void pickAvatar(event)}
          />
        </div>
        <label className="grid gap-1.5">
          <span className="font-medium text-foreground text-xs">{gt("Name")}</span>
          <Input
            autoFocus
            value={name}
            placeholder={gt("Scout")}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {editing === undefined ? (
          <label className="grid gap-1.5">
            <span className="font-medium text-foreground text-xs">{gt("Server")}</span>
            <Select
              value={environmentId ?? ""}
              onValueChange={(value) => {
                if (value !== null) setServerId(value);
              }}
            >
              <SelectTrigger aria-label={gt("Server")}>
                {server ? (
                  <EnvironmentMachineIcon kind={server.machine} className="size-3.5" />
                ) : null}
                <SelectValue>{server?.label ?? gt("No server connected")}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {servers.map((candidate) => (
                  <SelectItem key={candidate.environmentId} value={candidate.environmentId}>
                    <span className="inline-flex items-center gap-1.5">
                      <EnvironmentMachineIcon kind={candidate.machine} className="size-3" />
                      {candidate.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </label>
        ) : null}
        {editing === undefined ? (
          <label className="grid gap-1.5">
            <span className="font-medium text-foreground text-xs">{gt("Model")}</span>
            <Select
              value={model?.key ?? ""}
              onValueChange={(value) => {
                if (value !== null) setModelKey(value);
              }}
            >
              <SelectTrigger aria-label={gt("Model")}>
                <SelectValue>{model?.label ?? gt("No models available")}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {models.map((candidate) => (
                  <SelectItem key={candidate.key} value={candidate.key}>
                    {candidate.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </label>
        ) : null}
        {error !== null ? <p className="text-destructive text-xs">{error}</p> : null}
      </DialogPanel>
      <DialogFooter>
        {editing !== undefined ? (
          <RemoveBotButton bot={editing} disabled={busy} onRemoved={props.onClose} />
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={props.onClose} disabled={busy}>
          {gt("Cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={
            busy ||
            trimmedName === "" ||
            (editing === undefined && (environmentId === null || model === undefined))
          }
          onClick={() => void (editing === undefined ? create() : save())}
        >
          {editing === undefined ? gt("Create") : gt("Save")}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Pauses the bot's wake-ups and turns its thread back into an ordinary one. */
function RemoveBotButton(props: { bot: Bot; disabled: boolean; onRemoved: () => void }) {
  const gt = useGT();
  const tasksQuery = useEnvironmentQuery(
    serverEnvironment.scheduledTasksLive({ environmentId: props.bot.environmentId, input: {} }),
    useMessages(),
  );
  const setTaskEnabled = useAtomCommand(serverEnvironment.setScheduledTaskEnabled, {
    label: "bot remove: pause wake-ups",
  });
  const remove = async () => {
    const tasks = (tasksQuery.data?.tasks ?? []).filter(
      (task) => task.threadId === props.bot.threadId && task.enabled,
    );
    for (const task of tasks) {
      await setTaskEnabled({
        environmentId: props.bot.environmentId,
        input: { id: task.id, enabled: false },
      });
    }
    updateBots((bots) =>
      bots.filter(
        (bot) =>
          bot.environmentId !== props.bot.environmentId || bot.threadId !== props.bot.threadId,
      ),
    );
    updateBotLog(botThreadKey(props.bot), () => null);
    props.onRemoved();
  };
  return (
    <Button
      type="button"
      variant="destructive-outline"
      size="sm"
      className="me-auto"
      disabled={props.disabled || tasksQuery.data === undefined}
      onClick={() => void remove()}
    >
      {gt("Remove bot")}
    </Button>
  );
}
