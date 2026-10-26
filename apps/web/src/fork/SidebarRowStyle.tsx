import * as Schema from "effect/Schema";

import { useLocalStorage } from "../hooks/useLocalStorage";
import { SettingResetButton, SettingsRow } from "../components/settings/settingsLayout";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

// Fork: a per-device choice of sidebar thread row, kept out of the synced
// settings schema so the stock server never sees it.
const SidebarRowStyle = Schema.Literals(["one-line", "two-line", "vanilla"]);
type SidebarRowStyle = typeof SidebarRowStyle.Type;
const isSidebarRowStyle = Schema.is(SidebarRowStyle);

const STORAGE_KEY = "t3fork:sidebar-row-style";
const DEFAULT_STYLE: SidebarRowStyle = "one-line";
const LABELS: Record<SidebarRowStyle, string> = {
  "one-line": "One line",
  "two-line": "Two lines",
  vanilla: "Vanilla",
};

export function useSidebarRowStyle() {
  return useLocalStorage(STORAGE_KEY, DEFAULT_STYLE, SidebarRowStyle);
}

export function SidebarRowStyleSettingsRow() {
  const [style, setStyle] = useSidebarRowStyle();
  return (
    <SettingsRow
      id="fork-sidebar-row-style"
      title="Sidebar rows"
      description="One line per thread, two lines with the project above the title, or upstream's rows."
      resetAction={
        style !== DEFAULT_STYLE ? (
          <SettingResetButton label="sidebar rows" onClick={() => setStyle(DEFAULT_STYLE)} />
        ) : null
      }
      control={
        <Select
          value={style}
          onValueChange={(value) => {
            if (isSidebarRowStyle(value)) setStyle(value);
          }}
        >
          <SelectTrigger size="sm" className="w-full sm:w-40" aria-label="Sidebar rows">
            <SelectValue>{LABELS[style]}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {SidebarRowStyle.literals.map((value) => (
              <SelectItem hideIndicator key={value} value={value}>
                {LABELS[value]}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
}
