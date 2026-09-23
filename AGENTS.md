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

- The Research Intake and Research Review Queue routes are auth-gated behind Google/Apple OAuth, so the local-deploy autonomous tester cannot reach the family-scoped candidate UI; those runtime checks remain manual tests.
- Tenancy 1C-B2-B3-A1 moved the RelationshipProposal endpoints onto explicit familyId scoping: the canonical endpoints are the *ForFamily variants (createRelationshipProposalForFamily, listRelationshipProposalsForFamily, getRelationshipProposalForFamily) in mixins/relationship-proposal-scope-api.mo with domain logic in lib/relationship-proposal-scope.mo; the legacy no-argument createRelationshipProposal/listRelationshipProposals remain as TEMPORARY wrappers delegating with DEFAULT_FAMILY_ID.
- RelationshipProposal gained a required familyId : Text field, which required an enhanced-migration-chain entry (migrations/20260923_140000.mo) defaulting pre-existing proposals to 'norwood'; adding a field to a record used in an OQL Entity.manual .sample() also requires updating that sample literal or mops check fails with M0096.
- The legacy createRelationshipProposal/listRelationshipProposals were removed from research-intake-api.mo and lib/research-intake.mo and re-exposed as TEMPORARY wrappers in relationship-proposal-scope-api.mo so exactly one implementation exists; the old lib helper had to be deleted or mops check failed with M0151 (missing familyId) on its record literal.
- The pre-tenancy proposal reads (listRelationshipProposals) were Steward-only; the family-scoped reads preserve that Steward-only gate (requireRelationshipProposalStewardForFamily), not approved-member.
- Adding a required field to a Candid record type breaks frontend test fixtures that build that record literal; those fixtures live under src/frontend and are tester-owned, not a backend check failure.
- The PocketIC backend lane is intermittently wedged: it can withdraw a whole run as pocketic_sidecar_unreachable after the sidecar stops hosting the replica mid-run, and a retry may skip immediately; treat it as a coverage limit, not a product failure.
- The tool layer's own pnpm test run can time out at 480000ms because the full suite composes the frontend suite and the backend lane; run pnpm --dir src/frontend test and pnpm test:backend separately.
- The enhanced migration chain is directory-discovered via mops.toml [canisters.backend.migrations] chain = 'src/backend/migrations', so a new dated migration file needs no explicit registration.
- isPersonInFamily returns true for ANY well-formed personId in the default family (legacy Norwood tree), so cross-family person rejection is only meaningful for non-default families; the family-qualified profile key plus claim familyId check provide the isolation.
- There is no public endpoint that creates a Steward of a non-default family (claimSteward writes familyId='norwood'), so Steward-gated family-scoped proposal reads can only be executed by the Norwood Steward; the Family A/B read boundary is driven as the Norwood read excluding Family A plus the Family A id not resolving under Norwood.
- The local-deploy autonomous tester cannot reach family-scoped proposal flows: the app offers only Google/Apple sign-in with no Internet Identity path, so those runtime checks remain manual tests.
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
