/**
 * Plain-language progress through the import → analysis flow, so a user can
 * always see what is done and what to do next.
 */
export type StepState = "done" | "current" | "upcoming" | "skipped";

export interface ProgressStep {
  key: "file" | "resolve" | "calculate" | "prices";
  label: string;
  hint: string;
  state: StepState;
}

export interface ImportProgressInput {
  hasFile: boolean;
  acceptedCount: number;
  needsResolution: boolean;
  resolved: boolean;
  calculated: boolean;
  hasOpenPositions: boolean;
  pricesFetched: boolean;
}

export function importProgress(input: ImportProgressInput): ProgressStep[] {
  const steps: Array<Omit<ProgressStep, "state"> & { done: boolean; skipped?: boolean }> = [
    {
      key: "file",
      label: "Choose your tradebook",
      hint: "Pick your Zerodha tradebook CSV (or another CSV/TXT). It is read in your browser.",
      done: input.hasFile && input.acceptedCount > 0,
    },
    {
      key: "resolve",
      label: "Match instruments",
      hint: "Click “Resolve instruments” so each symbol/ISIN is matched to the right exchange listing.",
      done: input.resolved,
      skipped: input.hasFile && !input.needsResolution,
    },
    {
      key: "calculate",
      label: "Calculate P&L",
      hint: "Click “Calculate P&L” to see realized P&L, open quantities and break-even prices.",
      done: input.calculated,
    },
    {
      key: "prices",
      label: "Add live prices",
      hint: "Enter your access key and click “Fetch live quotes” to value open positions.",
      done: input.pricesFetched,
      skipped: input.calculated && !input.hasOpenPositions,
    },
  ];

  let currentAssigned = false;
  return steps.map(({ done, skipped, ...step }) => {
    if (done) return { ...step, state: "done" };
    if (skipped) return { ...step, state: "skipped" };
    if (!currentAssigned) {
      currentAssigned = true;
      return { ...step, state: "current" };
    }
    return { ...step, state: "upcoming" };
  });
}
