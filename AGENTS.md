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

- Tenancy 1C-B2-B3-A2 wired the Relationship Proposal frontend hooks to the active family context: useListRelationshipProposals and useCreateRelationshipProposal in useResearchIntake.ts now fork on useFamilyScopedId() exactly like the SOURCE/FINDING/CANDIDATE hooks (undefined -> legacy no-arg call + legacy key; else *ForFamily(familyId, ...) + [...legacyKey, familyScopedId]).
- ResearchIntakePage.tsx and ResearchReviewQueuePage.tsx consume the proposal hooks and never call the actor directly, so a hook-level family fork needs no page edits; no frontend surface performs a direct single-proposal lookup, so getRelationshipProposalForFamily is unused by the UI.
- The proposal mutation onSuccess invalidates the legacy key prefix ['research','relationshipProposals'], which prefix-matches both the legacy and family-scoped keys, so both branches refresh without a separate invalidation.
- The local-deploy autonomous tester cannot reach the family-scoped proposal UI: the Research Intake and Review Queue routes sit behind a family-only gate whose only sign-in paths are Google/Apple OAuth, so the preflight reports inconclusive with external_boundary and those runtime checks remain manual tests.
- Tenancy 1C-B2-B3-B made relationship proposal review family-scoped: the canonical endpoints are approveRelationshipProposalForFamily(familyId, proposalId) and rejectRelationshipProposalForFamily(familyId, proposalId) in mixins/relationship-proposal-scope-api.mo with domain logic in lib/relationship-proposal-scope.mo (approveForFamily/rejectForFamily/transitionForFamily/relationshipTypeFromText/nextRelationshipId/addConfirmedRelationshipForFamily); the legacy approveRelationshipProposal(id)/rejectRelationshipProposal(id) are TEMPORARY wrappers delegating with DEFAULT_FAMILY_ID and live in that same mixin (declaring them again in research-intake-api.mo would be M0051).
- Approval re-validates both people and the linked Source belong to familyId at approval time, transitions the proposal to Approved, and creates exactly one confirmed relationship inside familyId only; a foreign-family proposalId returns the existing safe not-found (?null) via RelationshipProposalScopeLib.getForFamily.
- The Review Queue Relationships portion/count is family-scoped by reusing RelationshipProposalScopeLib.listForFamily(proposals, familyId) in lib/finding-scope.mo computeQueueForFamily; the count aggregation loop derives from the filtered items list, so no separate count change is needed.
- The frontend proposal approve/reject hooks in useResearchIntake.ts now fork on useFamilyScopedId() exactly like the SOURCE/FINDING/CANDIDATE/PROPOSAL list+create hooks; useNeedsResearchRelationshipProposal stays legacy (family-scoped needs-research is out of scope).
- In mo:core, Text.trim takes a Pattern argument (e.g. t.trim(#predicate (fun ch = ch.isWhitespace()))); calling t.trim() with no argument fails with M0233.
- A double-quoted string literal inside a Motoko Text literal must escape its quotes; an unescaped quote terminates the string and the following word is reported as an unbound variable (M0057).
- The tool layer's composed pnpm test can time out at 480000ms because it runs the frontend suite and the backend PocketIC lane together; run pnpm --dir src/frontend test and pnpm test:backend separately.
- The PocketIC backend lane can withdraw a run as pocketic_sidecar_unreachable when the shared sidecar stops hosting the replica mid-run; treat it as a coverage limit, not a product failure.
- The Research Intake and Review Queue routes sit behind a Google/Apple OAuth gate with no Internet Identity path, so the local-deploy autonomous tester reports inconclusive with auth and those runtime checks remain manual tests.
- Tenancy 1C-B2-B4 made Conflict Review family-scoped: the canonical endpoints are listConflictReviewItemsForFamily(familyId), getConflictReviewItemForFamily(familyId, conflictId), listConflictsForPersonForFamily(familyId, personId), listDisputedFactsForPersonForFamily(familyId, personId), and resolveConflictForFamily(familyId, id, action, notes) in mixins/conflict-scope-api.mo with domain logic in lib/conflict-scope.mo; the legacy listConflictReviewItems/listConflictsForPerson/listDisputedFactsForPerson/resolveConflict are TEMPORARY wrappers delegating with DEFAULT_FAMILY_ID and live in that same mixin (declaring them again in research-intake-api.mo would be M0051).
- The legacy conflict helpers in lib/research-intake.mo (createConflictReviewItem, resolveConflict, disputedFactsForPerson) were deleted so exactly one implementation exists; the conflict-scope mixin reuses FindingScopeLib.updateStatusForFamily and FindingScopeLib.routeToCanonicalForFamily for the linked-finding transition and family-qualified profile promotion.
- Every conflict action validates conflict.familyId == familyId plus the linked Finding, linked Source (proposed and existing), and referenced PersonProfile all belong to familyId via lib/conflict-scope.mo helpers; a foreign-family conflictId returns the existing safe #err(#notFound(id)).
- The Review Queue Conflicts portion/count is family-scoped by reusing ConflictScopeLib.listForFamily(conflicts, familyId) in lib/finding-scope.mo computeQueueForFamily; the count aggregation loop derives from the filtered items list, so no separate count change is needed.
- ConflictReviewItem already carried familyId from Tenancy 1C-B2-B1 (migration 20260923_120000.mo), so Tenancy 1C-B2-B4 needed no new migration; adding a second migration whose OldActor omits familyId fails mops check with M0170 because the preceding chain state already carries the field.
- The frontend conflict hooks in useResearchIntake.ts fork on useFamilyScopedId() exactly like the SOURCE/FINDING/CANDIDATE/PROPOSAL hooks (undefined -> legacy no-arg call + legacy key; else *ForFamily(familyId, ...) + [...legacyKey, familyScopedId]); the mutation onSuccess invalidates the legacy ['research','conflicts'] prefix which matches both branches.
- useIsSteward is intentionally not family-scoped: the backend exposes no family-scoped Steward-authority endpoint, so the Conflict Review steward gate keeps calling isCallerSteward() with no familyId.
- Tenancy 1C-B2-B5 family-scoped the Research audit log: ResearchAuditEntry now carries familyId; the single canonical creation helper is lib/research-intake.mo appendAudit (familyId is its third parameter); every *-scope-api.mo mixin's private append*Audit wrapper forwards the familyId its workflow already validated, including appendSourceAudit in research-source-scope-api.mo for Source review (approve/reject/needsResearch).
- The canonical family-scoped Research audit read is getResearchAuditLogForFamily(familyId) in mixins/research-intake-api.mo, gated by FamilyAuthorizationLib.requireActiveStewardForFamily and filtered by ResearchLib.listAuditForFamily (e.familyId == familyId); the legacy getResearchAuditLog() is a TEMPORARY Tenancy 1C wrapper delegating with DEFAULT_FAMILY_ID and must live in the same mixin (M0051 otherwise).
- The migration 20260923_150000.mo adds familyId to researchAuditLog using the subset OldActor/NewActor form and backfills DEFAULT_FAMILY_ID; the OQL researchAuditLog entity in main.mo needed familyId added to both its .sample and .payload lists.
- The frontend useGetResearchAuditLog forks on useFamilyScopedId() like the other research hooks: undefined -> legacy getResearchAuditLog() + key ['research','audit']; else getResearchAuditLogForFamily(familyScopedId) + ['research','audit', familyScopedId].
- The Research Review Queue Audit/History view sits behind the Google/Apple OAuth gate with no Internet Identity path, so the local-deploy autonomous tester reports inconclusive with auth and those runtime checks remain manual tests.
