"use client";

import { useEffect } from "react";
import { useApi } from "@/hooks/useApi";
import type { CancellationMeta } from "@/hooks/usePayroll";

interface Props {
  cancellations: Record<string, CancellationMeta>;
  onChanged?: () => void;
}

/**
 * Keeps an appealed cancellation moving after a tab closes or a session
 * crashes. The server endpoint is idempotent and claims each transition, so
 * both dashboards may safely run this watcher at the same time.
 */
export function AppealWorkflowRecovery({ cancellations, onChanged }: Props) {
  const { api, authenticated } = useApi();
  const caseKey = Object.values(cancellations)
    .filter((c) => c.status === 2 && !/^0x0+$/.test(c.caseId))
    .map((c) => c.caseId)
    .sort()
    .join(",");

  useEffect(() => {
    if (!authenticated || !caseKey) return;
    let stopped = false;

    const advance = async () => {
      const caseIds = caseKey.split(",");
      await Promise.all(
        caseIds.map(async (caseId) => {
          try {
            const current = await api.getCancellationAppeal(caseId);
            if (stopped || !current.appeal) return;
            if (current.appeal.status === "complete" || current.appeal.status === "failed") return;
            await api.advanceCancellationAppeal(caseId);
            if (!stopped) onChanged?.();
          } catch {
            // A transient API/GenLayer outage is retried on the next tick.
          }
        })
      );
    };

    void advance();
    const timer = setInterval(() => void advance(), 10_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [api, authenticated, caseKey, onChanged]);

  return null;
}
