import { createFileRoute } from "@tanstack/react-router";

import { OverviewPage } from "../fork/OverviewPage";

// Fork: the Overview page.
export const Route = createFileRoute("/_chat/overview")({
  component: OverviewPage,
});
