import { ChevronDownIcon } from "lucide-react";
import { cn } from "../lib/utils";

/** The resting label for the Pinned and Active sections, styled and collapsed
 * like the shelf headers below them. It keeps the drag boundary's class, which
 * the collision detection measures, without that class's pickup reveal animation. */
export function SidebarSectionLabel(props: {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  isDropTarget: boolean;
}) {
  return (
    <button
      type="button"
      aria-expanded={props.expanded}
      onClick={props.onToggle}
      className={cn(
        "sidebar-drag-boundary-label absolute inset-0 flex cursor-pointer items-end gap-2 rounded-md px-2 pb-1 text-left text-xs leading-4 font-medium animate-none! focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
        props.isDropTarget ? "text-primary" : "text-sidebar-muted-foreground",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
      <span className="font-normal tabular-nums">{props.count}</span>
      <ChevronDownIcon
        aria-hidden
        className={cn(
          "mb-0.5 size-3 shrink-0 transition-transform",
          !props.expanded && "-rotate-90",
        )}
      />
    </button>
  );
}
