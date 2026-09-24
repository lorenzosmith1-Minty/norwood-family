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
- Tenancy 1C-C1 family-scoped the Message Board: the canonical endpoints are the 11 *ForFamily methods in mixins/board-scope-api.mo with pure domain logic in lib/board-scope.mo; the legacy no-familyId board endpoints are TEMPORARY wrappers in that same mixin delegating with FamilyTypes.DEFAULT_FAMILY_ID (declaring them again elsewhere would be M0051).
- lib/board.mo and mixins/board-api.mo were superseded and emptied to inert stubs (module {}; / mixin () {};) with their imports/includes removed from main.mo, so exactly one implementation of every board read, mutation, and authorization check exists.
- BoardScopeApi takes (posts, replies, profiles, notifications, auditLog, stewards, claims, archiveItems); archiveItems is needed so createBoardPostForFamily/updateBoardPostForFamily can validate every linkedMediaId resolves to an Archive item whose familyId matches.
- Board reads gate on FamilyAuthorizationLib.requireApprovedFamilyMemberForFamily; Steward moderation (archive/restore/removeReply) gates on requireActiveStewardForFamily; author-only edit checks post.authorAccountId == caller after a family-scoped lookup, so a foreign-family postId returns the existing safe ?null.
- The Board restore path must NOT use BoardScopeLib.getPostForFamily because it filters status == #Active; use BoardScopeLib.getPostForFamilyAnyStatus (family-scoped, status-agnostic) for restore, while getBoardPostForFamily keeps the #Active-only read semantics.
- Adding a required field (familyId) to backend Board records changes the generated TypeScript types, so frontend literals constructing Post/Reply/BoardMediaUpload must supply it; hooks/useBoard.ts and pages/BoardPostComposer.tsx supply familyId norwood while still calling the legacy no-familyId endpoints.
- The migration 20260924_000000.mo adds familyId to posts and replies using the subset OldActor/NewActor form and backfills DEFAULT_FAMILY_ID; the OQL boardPost/boardReply entities needed familyId added to both .sample and .payload.
- The PocketIC backend lane can be withdrawn as pocketic_sidecar_unreachable when the shared sidecar stops hosting the replica mid-run; treat it as a coverage limit, not a product failure.
- The local-deploy autonomous tester cannot reach the family-scoped Board UI: the Board and all family content sit behind a family-only gate whose only sign-in paths are Google/Apple OAuth, so the preflight reports inconclusive with external_boundary and those runtime checks remain manual tests.
- Tenancy 1C-C2 family-scoped the Message Board frontend: all 12 hooks in src/frontend/src/hooks/useBoard.ts fork on useFamilyScopedId() exactly like useResearchIntake.ts/useArchiveStorage.ts — undefined keeps the legacy no-familyId call and legacy key, else the *ForFamily method with familyScopedId as the first argument and familyScopedId appended to the query key; mutations invalidate the legacy ['board', ...] prefix which matches both branches.
- The two former hard-coded familyId 'norwood' literals in the Board frontend (hooks/useBoard.ts and pages/BoardPostComposer.tsx) are gone; BoardMediaUpload.familyId is now sourced from useActiveFamilyId() in useCreateBoardPostWithMedia and the composer, and src/frontend/src/types/board.ts BoardMediaUpload declares familyId.
- Adding a required field to the frontend BoardMediaUpload type breaks test-file literals that construct it (TS2741); the tester owns those test files and reconciles them, production workers must not edit *.test.tsx.
- The Board frontend family-wiring cover is src/frontend/src/BoardFamilyScopedCallShape.cover.test.tsx (non-default family path) plus BoardDefaultFamilyProviderCharacterize.test.tsx (default-family legacy call shapes and keys through the production FamilyProvider).
- The local-deploy autonomous tester cannot reach the family-scoped Board UI: the Board sits behind a family-only gate whose only sign-in paths are Google/Apple OAuth, so the preflight reports inconclusive with external_boundary and those runtime checks remain manual tests.
