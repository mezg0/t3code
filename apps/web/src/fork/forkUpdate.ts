import { useCallback } from "react";

/**
 * Opening this URL launches "Update T3 Code" on Hermes (fork/hermes), which
 * restarts the app into the latest fork build. The desktop shell allows this
 * one URL in addition to http(s) links.
 */
export const FORK_UPDATE_URL = "t3fork-update://now";

/** Click handler for the sidebar's update button; null outside the desktop app. */
export function useForkUpdateAction(): (() => void) | null {
  const handleClick = useCallback(() => {
    void window.desktopBridge?.openExternal(FORK_UPDATE_URL);
  }, []);
  return window.desktopBridge ? handleClick : null;
}
