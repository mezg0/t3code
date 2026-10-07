import { useEffect, useEffectEvent } from "react";

import { isMacPlatform } from "../lib/utils";

type HotkeyEvent = Pick<
  KeyboardEvent,
  "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "repeat"
>;

/**
 * Ctrl+1–9 on macOS (Alt+1–9 elsewhere, where Ctrl+digit already jumps to a
 * thread) filters the sidebar to project group 1–9, in the filter menu's
 * order; Ctrl+0 (Alt+0) goes back to all projects.
 * Fork-only, like the project filter hotkey: the stock server rejects unknown
 * keybinding commands. Returns the digit pressed, or null.
 */
export function projectGroupHotkeyDigit(event: HotkeyEvent, isMac: boolean): number | null {
  if (event.repeat || event.shiftKey) return null;
  const match = /^Digit([0-9])$/.exec(event.code);
  if (!match) return null;
  const modifiers = isMac
    ? event.ctrlKey && !event.metaKey && !event.altKey
    : event.altKey && !event.ctrlKey && !event.metaKey;
  return modifiers ? Number(match[1]) : null;
}

/** The menu hint for group `index` (0-based), or null past the ninth. */
export function projectGroupHotkeyLabel(index: number, isMac: boolean): string | null {
  if (index > 8) return null;
  return isMac ? `⌃${index + 1}` : `Alt+${index + 1}`;
}

export function useProjectGroupHotkeys(
  groupIds: readonly string[],
  onSelect: (groupId: string | null) => void,
): void {
  const select = useEffectEvent((digit: number) => {
    if (digit === 0) return onSelect(null);
    const groupId = groupIds[digit - 1];
    if (groupId !== undefined) onSelect(groupId);
  });

  useEffect(() => {
    const isMac = isMacPlatform(navigator.platform);
    const handleKeyDown = (event: KeyboardEvent) => {
      const digit = projectGroupHotkeyDigit(event, isMac);
      if (digit === null) return;
      event.preventDefault();
      event.stopPropagation();
      select(digit);
    };
    // Capture phase so focused editors (composer, terminal) can't swallow it.
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);
}
