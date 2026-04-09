import { Alert } from "../ui/Alert.js";
import { EmptyState } from "../ui/EmptyState.js";
import { SectionLabel } from "../ui/SectionLabel.js";
import { BriefingHero } from "./BriefingHero.js";

interface BriefingPageProps {
  projectId: string;
}

// NOTE: Placeholder data for the visual-language shape. Wiring real metrics
// is a follow-up — the hooks already exist (useTasks, useAgents, useCost,
// useDaemonStatus, useActivity). Once wired, the Activity column can stream
// real `ActivityItem` rows and the Attention column can surface real alerts.
export function BriefingPage({ projectId }: BriefingPageProps) {
  return (
    <div>
      <BriefingHero
        projectName={projectId}
        agentsWorking={0}
        tasksInFlight={0}
        attentionCount={0}
        spend="$0.00"
        budgetUsed="0%"
        uptime="—"
        queueDepth={0}
      />

      <div className="grid grid-cols-1 gap-[var(--gap-section)] lg:grid-cols-[1.35fr_1fr]">
        {/* Activity column */}
        <section>
          <SectionLabel>ACTIVITY</SectionLabel>
          <EmptyState
            title="No activity yet"
            body="When agents start working on this project, their actions will stream in here."
          />
        </section>

        {/* Attention column */}
        <section>
          <SectionLabel>ATTENTION</SectionLabel>
          <div className="flex flex-col gap-3">
            <Alert title="ALL CLEAR" variant="ok">
              Nothing needs your attention right now.
            </Alert>
          </div>
        </section>
      </div>
    </div>
  );
}
