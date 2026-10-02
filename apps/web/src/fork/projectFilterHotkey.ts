import { useEffect, useEffectEvent } from "react";

import { isMacPlatform } from "../lib/utils";

type HotkeyEvent = Pick<
  KeyboardEvent,
  "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "repeat"
>;

/**
 * Cmd+Shift+B (Ctrl+Shift+B off macOS) opens the sidebar's "Filter threads by
 * project" menu. Fork-only: the stock server validates keybinding commands,
 * so this can't be a configurable keybinding without server changes.
 */
export function isProjectFilterHotkey(event: HotkeyEvent, isMac: boolean): boolean {
  if (event.repeat || event.altKey || !event.shiftKey || event.code !== "KeyB") return false;
  return isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

export function useProjectFilterHotkey(onOpen: () => void, enabled: boolean): void {
  const open = useEffectEvent(onOpen);

  useEffect(() => {
    if (!enabled) return;
    const isMac = isMacPlatform(navigator.platform);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isProjectFilterHotkey(event, isMac)) return;
      event.preventDefault();
      event.stopPropagation();
      open();
    };
    // Capture phase so focused editors (composer, terminal) can't swallow it.
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled]);
}
