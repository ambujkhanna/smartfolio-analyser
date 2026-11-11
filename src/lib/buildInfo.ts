/**
 * Identifies which commit a deployment was built from, so the UI and
 * /api/version can show it. Vercel provides these variables at build and
 * run time; locally they are absent and the build reports "local".
 *
 * Only non-secret Git metadata is read here. Never add secrets to this output.
 */
export type BuildInfo = {
  commit: string | null;
  shortCommit: string;
  branch: string | null;
  environment: string;
};

type Env = Record<string, string | undefined>;

const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

export function getBuildInfo(env: Env = process.env): BuildInfo {
  const rawCommit = env.VERCEL_GIT_COMMIT_SHA?.trim() ?? "";
  const commit = SHA_PATTERN.test(rawCommit) ? rawCommit.toLowerCase() : null;
  const branch = env.VERCEL_GIT_COMMIT_REF?.trim() || null;
  const environment = env.VERCEL_ENV?.trim() || "local";

  return {
    commit,
    shortCommit: commit ? commit.slice(0, 7) : "local",
    branch,
    environment,
  };
}
