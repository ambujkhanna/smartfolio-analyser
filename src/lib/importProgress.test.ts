import { describe, expect, it } from "vitest";
import { importProgress, type ImportProgressInput } from "./importProgress";

const start: ImportProgressInput = {
  hasFile: false,
  acceptedCount: 0,
  needsResolution: false,
  resolved: false,
  calculated: false,
  hasOpenPositions: false,
  pricesFetched: false,
};

const states = (input: ImportProgressInput) => importProgress(input).map((step) => step.state);

describe("importProgress", () => {
  it("starts on choosing a file", () => {
    expect(states(start)).toEqual(["current", "upcoming", "upcoming", "upcoming"]);
  });

  it("moves to instrument matching after a file with accepted rows", () => {
    expect(states({ ...start, hasFile: true, acceptedCount: 10, needsResolution: true })).toEqual([
      "done", "current", "upcoming", "upcoming",
    ]);
  });

  it("skips matching when nothing needs resolving", () => {
    expect(states({ ...start, hasFile: true, acceptedCount: 10 })).toEqual(["done", "skipped", "current", "upcoming"]);
  });

  it("asks for prices once P&L is calculated with open positions", () => {
    expect(states({ ...start, hasFile: true, acceptedCount: 10, calculated: true, hasOpenPositions: true })).toEqual([
      "done", "skipped", "done", "current",
    ]);
  });

  it("skips prices when every position is closed", () => {
    expect(states({ ...start, hasFile: true, acceptedCount: 10, calculated: true })).toEqual([
      "done", "skipped", "done", "skipped",
    ]);
  });

  it("keeps the file step current when no rows were accepted", () => {
    expect(states({ ...start, hasFile: true, acceptedCount: 0 })[0]).toBe("current");
  });
});
