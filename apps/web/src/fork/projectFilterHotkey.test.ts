import { assert, describe, it } from "vite-plus/test";

import { isProjectFilterHotkey } from "./projectFilterHotkey";

const press = (overrides: Partial<Parameters<typeof isProjectFilterHotkey>[0]> = {}) => ({
  code: "KeyB",
  metaKey: false,
  ctrlKey: false,
  shiftKey: true,
  altKey: false,
  repeat: false,
  ...overrides,
});

describe("isProjectFilterHotkey", () => {
  it("matches Cmd+Shift+B on macOS and Ctrl+Shift+B elsewhere", () => {
    assert.isTrue(isProjectFilterHotkey(press({ metaKey: true }), true));
    assert.isTrue(isProjectFilterHotkey(press({ ctrlKey: true }), false));
  });

  it("ignores the other platform's modifier", () => {
    assert.isFalse(isProjectFilterHotkey(press({ ctrlKey: true }), true));
    assert.isFalse(isProjectFilterHotkey(press({ metaKey: true }), false));
  });

  it("ignores other keys, missing shift, extra alt and key repeat", () => {
    assert.isFalse(isProjectFilterHotkey(press({ metaKey: true, code: "KeyN" }), true));
    assert.isFalse(isProjectFilterHotkey(press({ metaKey: true, shiftKey: false }), true));
    assert.isFalse(isProjectFilterHotkey(press({ metaKey: true, altKey: true }), true));
    assert.isFalse(isProjectFilterHotkey(press({ metaKey: true, repeat: true }), true));
  });
});
