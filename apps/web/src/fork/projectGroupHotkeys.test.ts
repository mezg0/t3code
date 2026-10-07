import { describe, expect, it } from "vite-plus/test";

import { projectGroupHotkeyDigit, projectGroupHotkeyLabel } from "./projectGroupHotkeys";

const press = (
  code: string,
  modifiers: Partial<Record<"meta" | "ctrl" | "alt" | "shift", boolean>> = {},
) => ({
  code,
  metaKey: modifiers.meta ?? false,
  ctrlKey: modifiers.ctrl ?? false,
  altKey: modifiers.alt ?? false,
  shiftKey: modifiers.shift ?? false,
  repeat: false,
});

describe("projectGroupHotkeyDigit", () => {
  it("reads Ctrl+digit on macOS", () => {
    expect(projectGroupHotkeyDigit(press("Digit2", { ctrl: true }), true)).toBe(2);
    expect(projectGroupHotkeyDigit(press("Digit0", { ctrl: true }), true)).toBe(0);
  });

  it("reads Alt+digit elsewhere, where Ctrl+digit jumps to a thread", () => {
    expect(projectGroupHotkeyDigit(press("Digit3", { alt: true }), false)).toBe(3);
    expect(projectGroupHotkeyDigit(press("Digit3", { ctrl: true }), false)).toBeNull();
  });

  it("leaves Cmd+digit thread jumps and other combinations alone", () => {
    expect(projectGroupHotkeyDigit(press("Digit1", { meta: true }), true)).toBeNull();
    expect(projectGroupHotkeyDigit(press("Digit1", { ctrl: true, meta: true }), true)).toBeNull();
    expect(projectGroupHotkeyDigit(press("Digit1", { ctrl: true, shift: true }), true)).toBeNull();
    expect(projectGroupHotkeyDigit(press("KeyA", { ctrl: true }), true)).toBeNull();
  });
});

describe("projectGroupHotkeyLabel", () => {
  it("labels the first nine groups only", () => {
    expect(projectGroupHotkeyLabel(0, true)).toBe("⌃1");
    expect(projectGroupHotkeyLabel(8, false)).toBe("Alt+9");
    expect(projectGroupHotkeyLabel(9, true)).toBeNull();
  });
});
