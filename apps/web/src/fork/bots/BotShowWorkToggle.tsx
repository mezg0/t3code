import { useGT } from "gt-react";

import { Button } from "../../components/ui/button";
import { useBotShowWork } from "./botStore";

/** Switches bot threads between the chat view and every tool call. */
export function BotShowWorkToggle() {
  const gt = useGT();
  const [showWork, setShowWork] = useBotShowWork();
  return (
    <Button
      type="button"
      variant="ghost-muted"
      size="xs"
      aria-pressed={showWork}
      onClick={() => setShowWork(!showWork)}
    >
      {showWork ? gt("Hide work") : gt("Show work")}
    </Button>
  );
}
