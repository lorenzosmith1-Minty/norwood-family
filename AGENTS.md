# Project Guidance

## User Preferences

- Deliberately narrow tenancy builds: change only the named layer, never refactor unrelated endpoints in the same session
- Do not change current Norwood behavior for familyId = "norwood"
- Preserve the protected baseline: Tenancy 1A family model and migration, existing claims, Steward records, Archive, Research, Board, Messaging, Recipes, Stories, notifications, Security Pass 1 and Pass 2 behavior
- The family-scoped helpers must be the canonical source of truth; never leave two independent authorization implementations
- Temporary compatibility wrappers must be clearly marked as temporary
- Never expose family IDs or principals in user-facing errors
- Never use the Caffeine admin role for Steward authority
- No OAuth or Internet Identity browser testing; report authenticated browser checks as manual tests

## Verified Commands

- **typecheck**: `pnpm typecheck`
- **fix**: `pnpm fix`
- **build**: `pnpm build`

## Learnings

- The governance family-scope cover is test/pocketic/governance-family-scope.cover.test.ts (12 tests) plus the default-family baseline test/pocketic/governance-default-family.characterize.test.ts (17 tests) and test/pocketic/governance-api-doc.static.test.ts (5 tests).
- The PocketIC backend lane is flaky under load: backend-validation.cover.test.ts can saturate the shared replica sidecar (fetch failed / socket closed / 30s timeouts), after which the lane reports pocketic_sidecar_unreachable; retry the cover once and treat it as test_infrastructure, not a product regression.
- The local-deploy autonomous tester could not verify runtime behavior for the governance family-scoping: the PocketIC sidecar health check failed at http://127.0.0.1:8100/healthz (HTTP 503), so the preflight reported inconclusive with local_deploy_failed and authenticated governance checks remain manual tests.
- SuccessorDesignation now carries familyId : Text; designateSuccessorForFamily is the canonical path and designateSuccessor is a thin DEFAULT_FAMILY_ID wrapper; activateSuccessorForFamily's lookup requires familyId AND personId AND status == #Designated; listSuccessorsForFamily / listStewardIdentitiesForFamily are the family-scoped reads with legacy default-family wrappers.
- replaceSuccessor matches on (familyId, personId), so activating a designation in one family never rewrites an identically-keyed designation in another; StewardError gained #AlreadyDesignated for a duplicate family-scoped designation.
- The migration 20260929_000000.mo adds familyId to successors using the subset OldActor/NewActor form and backfills DEFAULT_FAMILY_ID ("norwood"), preserving personId/priority/assignedBy/assignedAt/status; the list is rebuilt once so a repeated upgrade is idempotent.
- The OQL successor entity in main.mo now carries familyId in .sample and .payload; the primary key remains personId.
- The successor family-scope cover is test/pocketic/governance-successor-family-scope.cover.test.ts (15 tests) plus the upgrade backfill test in backend.upgrade.test.ts and the default-family baselines governance-successor-designation.characterize.test.ts and GovernanceSuccessorConsumerContractCharacterize.test.tsx.
- The public API cannot bootstrap a non-default-family Steward, so the positive Family A successor direction is not drivable at the real-canister level; the denial direction plus the static source cover pin the family-scoping.
- The local-deploy autonomous tester could not verify the Governance successor/steward surfaces: the app offers only Google/Apple OAuth sign-in and the off-origin navigation is blocked by the autonomous browser boundary, so the preflight reported inconclusive with external_boundary and authenticated governance checks remain manual tests.
- main.mo canSeeArchiveItem is the OQL row-visibility rule for the archiveItem entity (wired via .ownedByWith("id", canSeeArchiveItem) with .controllerOrScoped()); its owner column is the archive item id, so the rule resolves the item first and passes item.familyId to both StewardAuthorityLib.isActiveStewardForFamily and FamilyAuthorizationLib.isApprovedFamilyMemberForFamily. DEFAULT_FAMILY_ID no longer appears in the rule.
- The archiveItem OQL entity payload exposes familyId and ArchiveLib.archiveRows emits familyId = it.familyId, so the row familyId is the family the authorization rule receives; tenancy is never inferred from the caller's default family or archiveItemId alone.
- The Archive visibility family-scope cover is src/frontend/src/ArchiveVisibilityFamilyScopeCharacterize.test.tsx (source-executing evaluation of the real canSeeArchiveItem body with a non-vacuous self-check), plus the PocketIC archive-family-isolation.cover.test.ts (12 tests) which drives the real canister's family-scoped Archive endpoints.
- canSeeArchiveItem is an internal OQL row-visibility rule with no public endpoint, so the PocketIC lane cannot call it directly; the family-scoped assertions execute the rule body extracted from src/backend/main.mo. No public endpoint bootstraps a non-default-family Steward, so the positive Family A Steward direction is covered only by the static source-executing test.
- mops check --fix reports only pre-existing M0194 unused-identifier warnings in lib/ownership.mo; they are unrelated to the archive visibility patch and do not fail the check.
- The local-deploy autonomous tester verified the app loads and the Family Archive surface renders without error after the Archive visibility family-scoping change: heading 'Our Family Archive', type tabs, family-member and era filters, search box, and a coherent empty state with no console errors or failed requests, confirming public and default Norwood Archive visibility remain unchanged.
- Non-upload Research Source creation is now family-scoped: mixins/research-intake-api.mo exposes canonical createSourceForFamily(familyId, title, sourceType, description, archiveItemId) and createSource(...) is a thin TEMPORARY DEFAULT_FAMILY_ID wrapper delegating to the same private createSourceForFamilyInternal(familyId, ..., caller).
- createSourceForFamilyInternal takes the caller explicitly so the membership gate evaluates the real caller rather than the canister principal a shared-to-shared call would present; it gates on FamilyAuthorizationLib.isApprovedFamilyMemberForFamily, validates a linked Archive item via ArchiveLib.belongsToFamily, writes the audit via ResearchLib.appendAudit(familyId,...), and notifies via NotificationsScopeLib.createUniqueForFamily(familyId,...).
- The non-upload Source creation payload (title, sourceType, description, archiveItemId) carries no person/profile references, so family validation for that path is limited to the linked Archive item; person-reference validation (requirePeopleInFamily) applies only to the upload and board paths that accept relatedMemberIds.
- The ResearchIntakeApi mixin is already included in main.mo with archiveItems passed in, so a new public endpoint in that mixin is exposed without any main.mo change.
- The two-family isolation covers are test/pocketic/research-source-create-for-family.cover.test.ts (13 real-canister tests) and research-source-create-for-family.static.test.ts (12 static source-executing tests).
- No public endpoint bootstraps a Steward of a non-default family, so the positive Family A Steward-gated read direction is not drivable at the real-canister level; the Family A audit entry is proven by absence from the Norwood audit log plus the static source-executing cover.
- The PocketIC backend lane is flaky under load: a full-suite run can hit shared-sidecar saturation (fetch failed / ECONNREFUSED / other side closed) and report pocketic_sidecar_unreachable; retry the lane once and treat it as test_infrastructure, not a product regression.
- The frontend hook comment in src/frontend/src/hooks/useResearchIntake.ts still claims no family-scoped createSource endpoint exists; it is now stale but the frontend is out of scope for the backend-only patch.
- The local-deploy autonomous tester could not verify the Research Source creation flow for the family-scoped non-upload Source patch: the app rendered the Norwood landing page and Family Archive surface cleanly with no console errors, but every browser_act was rejected with 'The browser session is unavailable for this task', so the preflight reported inconclusive with infra; authenticated Research Source creation checks remain manual tests.
