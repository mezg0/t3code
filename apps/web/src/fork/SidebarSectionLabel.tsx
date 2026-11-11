import { cn } from "../lib/utils";

/**
 * The resting label for the Pinned and Active sections, styled like the shelf
 * headers below them. It keeps the drag boundary's class, which the collision
 * detection measures, without that class's pickup reveal animation.
 */
export function SidebarSectionLabel(props: {
  label: string;
  count: number;
  isDropTarget: boolean;
}) {
  return (
    <div
      className={cn(
        "sidebar-drag-boundary-label absolute inset-0 flex items-end gap-2 px-2 pb-1 text-xs leading-4 font-medium animate-none!",
        props.isDropTarget ? "text-primary" : "text-sidebar-muted-foreground",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
      <span className="font-normal tabular-nums">{props.count}</span>
      {/* Stands in for the shelf headers' chevron so the counts share a column. */}
      <span aria-hidden className="size-3 shrink-0" />
    </div>
  );
}
