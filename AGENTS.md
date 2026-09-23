# Project Guidance

## User Preferences

- Deliberately narrow tenancy builds: change only the named authorization layer, never refactor endpoints in the same session
- Do not change current Norwood behavior for familyId = "norwood"
- Preserve the protected baseline: Tenancy 1A family model and migration, existing claims, Steward records, Archive, Research, Board, Messaging, Recipes, Stories, notifications, Security Pass 1 and Pass 2 behavior, Research single-approval behavior, document format support
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

- approveClaimForFamily's governance audit summary must include the affected person id ('Approved a profile claim for ' # claim.personId) to match the pre-change text consumed by backend-review.test.ts.
- The backend exposes no family-scoped Steward-authority endpoints, so useStewardAuthority keeps calling isCallerSteward/hasActiveSteward/claimSteward with no arguments.
- The PocketIC backend lane can fail with pocketic_sidecar_unreachable; that is shared-sidecar instability, not a product regression — rerun the lane.
- governance.mo still reads/writes profiles by bare personId (lines 435, 617); that is the excluded, not a regression, and belongs to a later Tenancy 1C build
- Tenancy 1C-B1 moved the Archive endpoints onto explicit familyId scoping: the canonical endpoints are the *ForFamily variants (submitArchiveItemForFamily, listPendingArchiveItemsForFamily, approveArchiveItemForFamily, rejectArchiveItemForFamily, listApprovedArchiveItemsForFamily, getArchiveItemForFamily, searchArchiveItemsForFamily, getPendingContributionsCountForFamily); the legacy no-argument endpoints remain as TEMPORARY wrappers delegating with DEFAULT_FAMILY_ID.
- In Motoko, a public shared function must never call another public shared function in the same actor for caller-based authorization: the callee's { caller } becomes the canister's own principal and denies the real user. Legacy wrappers must delegate to an internal (non-shared) function that takes caller explicitly, as submitArchiveItemForFamilyInternal does.
- isApprovedFamilyMemberForFamily accepts an approved claim by the caller when c.familyId == familyId, or when familyId == DEFAULT_FAMILY_ID and c.familyId == '' (pre-tenancy records); non-default families stay strictly scoped.
- isPersonInFamily accepts a person tracked in the requested family via TenancyLib.getProfileForFamily in addition to an approved claim, so seeded Norwood profiles with no claim (e.g. 'julia') still pass related-person validation while genuinely foreign people are rejected.
- The archive mixins now take profiles as a parameter (ArchiveApi and ArchiveResearchBoardNotificationsApi) so the related-person family check can resolve family-qualified profiles; main.mo passes it.
- The PocketIC sidecar at POCKETIC_SIDECAR_URL is intermittently wedged (/healthz empty or http=000 while the raw server at 127.0.0.1:8001 stays healthy); the lane skips with pocketic_sidecar_unreachable and must be retried.
- The static predicate evaluator in test/pocketic/family-scoped-authorization.behavior.test.ts is now a recursive-descent parser handling or/and precedence, parentheses, and FamilyTypes.DEFAULT_FAMILY_ID.
- The local-deploy autonomous tester cannot complete an Archive contribution because the platform storage mutation at /v1/blob-tree/ is blocked in preflight, so Archive submit/review and cross-family isolation remain manual tests.
- Tenancy 1C-B2-A moved the Research Source endpoints onto explicit familyId scoping: the canonical endpoints are the *ForFamily variants (listSourcesForFamily, getSourceForFamily, approveSourceForFamily, rejectSourceForFamily, needsResearchSourceForFamily, getReviewQueueForFamily) in mixins/research-source-scope-api.mo with domain logic in lib/research-source-scope.mo; the legacy no-argument endpoints remain as TEMPORARY wrappers delegating with DEFAULT_FAMILY_ID.
- SourceRecord gained a required familyId : Text field, which required an enhanced-migration-chain entry (migrations/20260923_000837.mo) defaulting pre-existing sources to 'norwood'; adding a field to a record used in an OQL Entity.manual .sample() also requires updating that sample literal or mops check fails with M0096.
- The pre-tenancy Research source reads (listSources/getSource) were Steward-only; the family-scoped reads must preserve that Steward-only gate (requireSourceStewardForFamily), not relax to approved-member.
- The family-scoped source review cascade uses ArchiveLib.transitionStatus (no notification) so a single source decision emits exactly one ResearchApproved/ResearchRejected notification and no Archive notification; linkedArchiveItemIdInFamily requires both the source and the linked Archive item to carry familyId == familyId so an archiveItemId is never followed across a family boundary.
- For family-aware React Query keys, the conditional must be on the whole key array (familyScopedId === undefined ? legacyKey : [...legacyKey, familyScopedId]), not on a trailing segment (familyScopedId ?? ''), because the frozen default-family characterization requires no trailing empty-string segment.
- The Research Intake and Research Review Queue routes are auth-gated behind Google/Apple OAuth, so the local-deploy autonomous tester cannot reach them; those runtime checks remain manual tests.
- Tenancy 1C-B2-B1 moved the Proposed Findings endpoints onto explicit familyId scoping: the canonical endpoints are the *ForFamily variants (createFindingForFamily, listFindingsForFamily, getFindingForFamily, approveFindingForFamily, rejectFindingForFamily, needsResearchFindingForFamily) in mixins/finding-scope-api.mo with domain logic in lib/finding-scope.mo; the legacy no-argument endpoints remain as TEMPORARY wrappers delegating with DEFAULT_FAMILY_ID.
- ProposedFinding and ConflictReviewItem gained a required familyId : Text field, which required an enhanced-migration-chain entry (migrations/20260923_120000.mo) defaulting pre-existing records to 'norwood'; adding a field to a record used in an OQL Entity.manual .sample() also requires updating that sample literal or mops check fails with M0096.
- A mixin cannot call an internal (non-shared) helper declared in a different mixin; family-scoped promotion helpers used by both finding-scope-api and research-intake-api must live in a shared lib module (lib/finding-scope.mo) rather than being duplicated.
- The family-scoped finding review cascade promotes approved findings via TenancyLib.getProfileForFamily/putProfileForFamily and re-checks profile.familyId == finding.familyId, so a Family A finding can never mutate a same-personId profile in Family B.
- getReviewQueueForFamily routes the Findings section through FindingScopeLib.computeQueueForFamily so the Findings count is family-correct while the Sources section stays byte-identical to Tenancy 1C-B2-A; Candidates/Relationships/Conflicts remain unscoped.
- The frontend finding hooks in useResearchIntake.ts are now family-aware exactly like the SOURCE hooks: familyScopedId === undefined ? legacy no-arg call + legacy key : *ForFamily(familyId, ...) call + [...legacyKey, familyScopedId] whole-array key.
- The PocketIC backend lane can skip with pocketic_sidecar_unreachable (shared-sidecar instability, rerun); the full pnpm test suite can exceed the tester's 1800s budget, so run the frontend suite and the backend lane separately.
