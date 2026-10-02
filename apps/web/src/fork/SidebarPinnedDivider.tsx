/**
 * Hairline between pinned and active threads. Absolutely positioned inside the
 * zero-height pinned-divider marker so it sits in the gap between rows without
 * changing the list's layout.
 */
export function SidebarPinnedDivider() {
  return <div aria-hidden className="absolute inset-x-2 -top-px h-px bg-sidebar-foreground/20" />;
}
