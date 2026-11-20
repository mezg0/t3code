import { useGT } from "gt-react";
import { EyeIcon } from "lucide-react";

import { Toggle } from "../../components/ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../../components/ui/tooltip";
import { useBotShowWork } from "./botStore";

/** Switches bot threads between the chat view and every tool call. */
export function BotShowWorkToggle() {
  const gt = useGT();
  const [showWork, setShowWork] = useBotShowWork();
  const label = showWork ? gt("Hide work") : gt("Show work");
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="flex shrink-0" />}>
        <Toggle
          className="shrink-0 [-webkit-app-region:no-drag]"
          pressed={showWork}
          onPressedChange={setShowWork}
          aria-label={label}
          variant="ghost"
          size="sm"
        >
          <EyeIcon className="size-4" />
        </Toggle>
      </TooltipTrigger>
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
}
