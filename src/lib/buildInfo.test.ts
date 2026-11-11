import { describe, expect, it } from "vitest";
import { getBuildInfo } from "./buildInfo";

describe("getBuildInfo", () => {
  it("reports the Vercel commit, branch and environment", () => {
    const info = getBuildInfo({
      VERCEL_GIT_COMMIT_SHA: "A1E6906F5DD26175F799CF868C7BC078E06CEAC3",
      VERCEL_GIT_COMMIT_REF: "feat/reliable-pnl-foundation",
      VERCEL_ENV: "preview",
    });
    expect(info).toEqual({
      commit: "a1e6906f5dd26175f799cf868c7bc078e06ceac3",
      shortCommit: "a1e6906",
      branch: "feat/reliable-pnl-foundation",
      environment: "preview",
    });
  });

  it("falls back to local when Vercel metadata is absent", () => {
    expect(getBuildInfo({})).toEqual({
      commit: null,
      shortCommit: "local",
      branch: null,
      environment: "local",
    });
  });

  it("ignores a malformed commit value instead of echoing it", () => {
    const info = getBuildInfo({ VERCEL_GIT_COMMIT_SHA: "<script>not-a-sha</script>" });
    expect(info.commit).toBeNull();
    expect(info.shortCommit).toBe("local");
  });
});
