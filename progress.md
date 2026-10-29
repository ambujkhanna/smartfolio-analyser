# Smartfolio Analyser — Progress Tracker

**Last updated:** 29 October 2026  
**Repository:** https://github.com/ambujkhanna/smartfolio-analyser  
**Working branch:** `docs/project-plan-and-progress`  
**Pull request:** No pull request has been created in this repository yet.

> Update this file at the end of every implementation stage, after verifying actual code, tests, builds, and GitHub state. Never mark work complete based only on a plan or an attempted tool call.

## Current status

**Current stage:** Stage 0 — Documentation and baseline  
**Overall status:** Project log, implementation plan, progress tracker, and expanded README are committed on the documentation branch. Application implementation has not yet been changed in this workstream.  
**Last verified action:** README was expanded on `docs/project-plan-and-progress`, and the update was verified by reading it back from GitHub. Pull request #1 is open and not merged.  
**Application code changed in this stage:** No.

## Completed

- [x] Read and audited the existing README and key app files in an earlier repository inspection.
- [x] Recorded the current known stack: Next.js 15, React 19, TypeScript, Tailwind CSS, PapaParse, Recharts, Vercel.
- [x] Documented the critical risk that the audited P&L engine uses mocked prices and a ₹100 fallback for unknown symbols.
- [x] Expanded README with objectives, lifecycle P&L example, known limitations, architecture direction, provider candidates, roadmap, local setup, and acceptance criteria.
- [x] Verified the updated README on the feature branch.
- [x] Opened PR #1 targeting `main`.

## In progress

- [x] Add the consolidated project log, `plan.md`, and `progress.md` to the repository and verify all three by reading them back from GitHub.
- [ ] Recheck current source and branch state before making code changes.

## Not yet implemented / left to do

- [ ] Remove hard-coded market prices and the unknown-symbol ₹100 fallback.
- [ ] Represent missing quotes and dependent metrics as explicitly unavailable.
- [ ] Add regression tests for missing/unknown prices.
- [ ] Define and test accounting formulas and cost-allocation methodology.
- [ ] Improve broker-specific CSV import, validation, and duplicate detection.
- [ ] Add opening-balance support and holdings reconciliation.
- [ ] Implement stable instrument resolution.
- [ ] Select and implement permitted Indian equity/ETF quote provider after checking official terms, coverage, limits, and cost.
- [ ] Implement mutual-fund NAV data model and resolver.
- [ ] Add price/NAV provenance, freshness, cache, and provider-error handling.
- [ ] Add data-quality UI and deployment acceptance checks.

## Blockers / decisions still needed

- Confirm which real broker export should be the first supported format (Zerodha is a likely starting point from prior discussion).
- Decide the initial accounting/cost-allocation method and document its scope.
- Choose the market-data provider after official documentation and cost review.
- Decide how opening cost basis will be supplied when historical transactions are missing.
- Decide whether dividends and account-level charges are included in the first reliable release.

These decisions should be resolved at the stage where they become necessary; they must not delay removal of fabricated prices.

## Next step to pick

**Next recommended task:** Start Stage 0 baseline verification on the implementation branch. Fetch the current `src/engine/calculatePnL.ts`, `src/types/trade.ts`, `src/components/HoldingsTable.tsx`, and test configuration; run the existing production build and determine whether tests exist. Record the exact results here before changing application code.

## Stage history

| Date | Stage | Outcome | Verification |
|---|---|---|---|
| 2026-10-29 | README documentation | Expanded README committed to `docs/project-plan-and-progress`; PR #1 opened | Fetched README from GitHub and confirmed the updated content and blob SHA |
| 2026-10-29 | Project log / plan / progress | Added `docs/PROJECT_LOG.md`, `plan.md`, and `progress.md` to the documentation branch | All three files were fetched back from GitHub and their content/length checked; file commits: `380b1f72b4f2b06a729262748a9f444bde86df45`, `43d6ac0ff11a6c726383f975a057e1535cc80da6`, `48cb2f3d9fe2324629815cf14085f9f521339eae` |

## Update template for each future stage

Append a new row to the stage history and update the status sections above:

- **Stage and date:**
- **Goal:**
- **Files changed:**
- **Implemented:**
- **Tests run and results:**
- **Build result:**
- **Known gaps or risks:**
- **Blockers/decisions:**
- **Next recommended step:**
- **Commit/PR link:**
