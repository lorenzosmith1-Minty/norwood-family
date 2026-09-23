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

- Tenancy 1C-B2-B1 moved the Proposed Findings endpoints onto explicit familyId scoping: the canonical endpoints are the *ForFamily variants (createFindingForFamily, listFindingsForFamily, getFindingForFamily, approveFindingForFamily, rejectFindingForFamily, needsResearchFindingForFamily) in mixins/finding-scope-api.mo with domain logic in lib/finding-scope.mo; the legacy no-argument endpoints remain as TEMPORARY wrappers delegating with DEFAULT_FAMILY_ID.
- ProposedFinding and ConflictReviewItem gained a required familyId : Text field, which required an enhanced-migration-chain entry (migrations/20260923_120000.mo) defaulting pre-existing records to 'norwood'; adding a field to a record used in an OQL Entity.manual .sample() also requires updating that sample literal or mops check fails with M0096.
- A mixin cannot call an internal (non-shared) helper declared in a different mixin; family-scoped promotion helpers used by both finding-scope-api and research-intake-api must live in a shared lib module (lib/finding-scope.mo) rather than being duplicated.
- The family-scoped finding review cascade promotes approved findings via TenancyLib.getProfileForFamily/putProfileForFamily and re-checks profile.familyId == finding.familyId, so a Family A finding can never mutate a same-personId profile in Family B.
- getReviewQueueForFamily routes the Findings section through FindingScopeLib.computeQueueForFamily so the Findings count is family-correct while the Sources section stays byte-identical to Tenancy 1C-B2-A; Candidates/Relationships/Conflicts remain unscoped.
- The frontend finding hooks in useResearchIntake.ts are now family-aware exactly like the SOURCE hooks: familyScopedId === undefined ? legacy no-arg call + legacy key : *ForFamily(familyId, ...) call + [...legacyKey, familyScopedId] whole-array key.
- The PocketIC backend lane can skip with pocketic_sidecar_unreachable (shared-sidecar instability, rerun); the full pnpm test suite can exceed the tester's 1800s budget, so run the frontend suite and the backend lane separately.
- Tenancy 1C-B2-B2 moved the New Person Candidate endpoints onto explicit familyId scoping: the canonical endpoints are the *ForFamily variants (createNewPersonCandidateForFamily, listNewPersonCandidatesForFamily, getNewPersonCandidateForFamily, approveNewPersonCandidateForFamily, rejectNewPersonCandidateForFamily, needsResearchNewPersonCandidateForFamily) in mixins/candidate-scope-api.mo with domain logic in lib/candidate-scope.mo; the legacy no-argument endpoints remain as TEMPORARY wrappers delegating with DEFAULT_FAMILY_ID.
- NewPersonCandidate gained a required familyId : Text field, which required an enhanced-migration-chain entry (migrations/20260923_130000.mo) defaulting pre-existing candidates to 'norwood'; adding a field to a record used in an OQL Entity.manual .sample() also requires updating that sample literal or mops check fails with M0096.
- Two mixins included in the same actor cannot both declare a private helper with the same name: the second include fails with M0051 'duplicate definition for <name> in block'. Private mixin helpers must be uniquely named per mixin (candidate-scope-api's sourceInFamily was renamed candidateSourceInFamily to avoid colliding with finding-scope-api's sourceInFamily).
- Candidate approval now calls CandidateScopeLib.isDuplicateInFamily(profiles, familyId, c.name, c.details) before createCanonicalPersonForFamily; the predicate filters profile.familyId == familyId, treats an empty candidate name as never matching, and constrains by name alone when details is empty, so a same-name profile in another family never blocks approval.
- The canonical Review Queue lives in lib/finding-scope.mo computeQueueForFamily; candidate-scope.mo must not carry a second queue implementation, so the Candidates section is family-scoped there and the duplicate was removed.
- The frontend candidate hooks in useResearchIntake.ts are now family-aware exactly like the SOURCE and FINDING hooks: familyScopedId === undefined ? legacy no-arg call + legacy key : *ForFamily(familyId, ...) call + [...legacyKey, familyScopedId] whole-array key.
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
