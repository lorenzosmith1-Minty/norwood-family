# Project Guidance

## User Preferences

- Frontend-only phases: change only the named layer, never refactor unrelated endpoints or domains in the same session
- Use the existing centralized active familyId (useFamilyScopedId); never hard-code 'norwood'
- Preserve the existing Norwood visual language (typography, beige/off-white surfaces, rounded cards/buttons, spacing); do not redesign
- Steward-facing review reads must be family-scoped and privacy-safe: never expose account principals, confirmer person ids, relationship ids, or sensitive relationship context
- Neutral success and error wording; never expose technical error tags or private reasons to users
- No OAuth or Internet Identity browser testing; report authenticated browser checks as manual tests

## Verified Commands

- **typecheck**: `pnpm typecheck`
- **fix**: `pnpm fix`
- **build**: `pnpm build`

## Learnings

- The Phase 1D-UI-AH-H local-deploy preflight was inconclusive (external_boundary): the default route rendered the Norwood shell with no blank screen, but the family display name and Pending-membership copy could not be observed because the only sign-in path is Google/Apple OAuth, blocked by the autonomous browser boundary. Authenticated confirmation flows remain MANUAL TEST (no OAuth/II browser testing).
- Phase 1D-UI-B1 Steward membership review discovery: src/backend/types/membership-confirmation.mo adds MembershipConfirmationReviewView (familyId, membershipId, pendingPersonId, applicantDisplayName, simpleRelationship, membershipStatus, confirmationHistory, confirmedCount, disputedCount, confirmationState) and a history-entry type; src/backend/lib/membership-confirmation.mo adds listReviewsForSteward (derived read over existing stable state, no new persisted field, no migration change); src/backend/mixins/membership-confirmation-api.mo adds listMembershipConfirmationReviewsForSteward(familyId) gating anonymous (#NotSignedIn) and non-active-Steward-for-family (#NotAuthorized).
- listMembershipConfirmationReviewsForSteward reuses confirmationStateForMembership and keeps only #StewardReviewRequired cases, so #ResolvedBySteward/#ApprovedByRelative/#AwaitingConfirmation are excluded without touching confirmation decisions or membership transitions.
- The Steward review view resolves confirmer display names server-side from profiles.get(confirmerPersonId).name with a neutral 'Family member' fallback, and never carries confirmerAccountId, confirmerPersonId, or relationshipId.
- The simple relationship label for a review case is derived via findConfirmedRelationshipBetween(familyId, pendingPersonId, confirmerPersonId) and simpleRelationshipLabel; a missing confirmed relationship falls back to a neutral #Sibling label rather than exposing raw context.
- MembershipConfirmationApi already receives confirmations, stewardResolutions, memberships, profiles, claims, confirmedRelationships, and stewards, so the new endpoint needed no main.mo wiring and no new stable state.
- After the Phase 1D-UI-B1 bindgen the authoritative positional aliases are: listMembershipConfirmationReviewsForSteward->Result_21, the Steward read tuple->Result_28, invitation redemption state->Result_29, designateSuccessor->Result_30, createSourceWithUpload->Result_32, createSource->Result_33, createRelationshipProposal->Result_34, createNewPersonCandidate->Result_35, createFinding->Result_38, addRelationship/correctRelationshipType->Result_41.
- Adding a new backend method inserts a positional alias and shifts every later generated alias by one; production frontend hooks that hard-code aliases (useGovernance.ts, useResearchIntake.ts) must be repaired to the post-shift map read from src/frontend/src/backend.d.ts.
- pnpm typecheck in this project includes *.test.* files, so a clean production typecheck cannot be observed via exit code alone; filter diagnostics with `rg '^src/' | rg -v '\.test\.'` to isolate production errors.
- Tester-owned frontend characterization tests that hard-code positional aliases break on every new backend method and must be reconciled by the tester; production workers must not edit them.
- The Phase 1D-UI-B1 focused PocketIC lane passed 6/6 (test/pocketic/membership-confirmation-steward-review.cover.test.ts) against the real canister; the local-deploy preflight was inconclusive (local_deploy_failed, PocketIC sidecar health check HTTP 503), so runtime behavior was not verified. Authenticated Steward flows remain MANUAL TEST (no OAuth/II browser testing).
- Phase 1D-UI-B2 Steward Membership Reviews frontend: src/frontend/src/hooks/useMembershipReviews.ts (family-scoped read of listMembershipConfirmationReviewsForSteward; query key [membershipReviews, familyScopedId ?? '', 'list']; exports useMembershipReviews and useUnresolvedMembershipReviewCount), src/frontend/src/pages/FamilyStewardMembershipReviewsPage.tsx, src/frontend/src/components/MembershipReviewCaseCard.tsx (expandable case card with human-readable confirmation history), plus a Membership Reviews hub-option card with a steward-count-badge in FamilyStewardHubPage.tsx and a Steward-only 'membership-reviews' view in App.tsx.
- The Steward reviews read returns only unresolved #StewardReviewRequired cases, so the hub badge count is simply the review list length and always agrees with the page.
- MembershipConfirmationReviewView carries membershipId, pendingPersonId, and familyId which must never be rendered; only applicantDisplayName, simpleRelationship, membershipStatus, confirmedCount, disputedCount, and confirmationHistory are display-safe.
- React Query invalidateQueries matches by key prefix, so a predicate built for the membershipConfirmation prefix does not cover a membershipReviews-prefixed cache even when both use familyScopedId at index 1; the useMembershipReviews doc comment claiming otherwise is inaccurate (minor, no user-visible impact while no mutation invalidates this cache).
- Concurrent frontend workers editing overlapping files (App.tsx, the hub page, and a shared hook module) can create duplicate page/hook artifacts and lost props; a follow-up check wave must reconcile to one canonical implementation.
- FamilyStewardHubPageProps now requires onOpenMembershipReviews; tester-owned characterization tests that construct the hub without it fail typecheck and must be reconciled by the tester, not production workers.
- The Phase 1D-UI-B2 generated-app cover passed: frontend Vitest 274 files / 2439 tests; the PocketIC backend lane ran green 77 files / 821 tests including the real listMembershipConfirmationReviewsForSteward cover; typecheck clean.
- The Phase 1D-UI-B2 local-deploy preflight was inconclusive (auth): the preview deployed and rendered, but the Steward dashboard and Membership Reviews screen sit behind Google/Apple OAuth sign-in, which the autonomous browser cannot cross. Authenticated Steward review flows remain MANUAL TEST (no OAuth/II browser testing).
- Phase 1D-UI-B3 Steward membership resolution actions: src/frontend/src/hooks/useMembershipReviews.ts now exports useResolveMembershipConfirmation, membershipReviewsInvalidation, isAlreadySettledError, and ResolveMembershipOutcome; the read hook rejects on the backend err branch so the page can render a neutral error state with Retry instead of an empty list.
- useResolveMembershipConfirmation invalidates four family-exact caches: membershipConfirmation (predicate), myMembership (exact key), membershipReviews (predicate), and notifications; the membershipReviews predicate is required because the membershipConfirmation prefix does not cover it.
- MembershipReviewCaseCard renders Approve Membership / Reject Membership (Radix AlertDialog confirmation) and Needs More Information (direct submit) using the existing steward-approve / steward-reject / steward-pending-action CSS classes; it keeps a local CaseResult state so a resolved case shows a neutral result panel.
- isAlreadySettledError maps case-change error tags (MembershipNotPending, AlreadyDecided, MembershipNotFound, FamilyNotFound, NoActiveMembership, NoQualifyingRelationship, ActivationFailed) to a neutral already-settled state while NotSignedIn/NotSteward/NotAuthorized stay errors.
- The Phase 1D-UI-B3 generated-app cover passed: frontend Vitest 276 files / 2474 tests; the PocketIC backend lane skipped with no_backend_wasm; typecheck clean.
- The Phase 1D-UI-B3 local-deploy preflight was inconclusive (external_boundary): the preview deployed and rendered, but the Steward Membership Reviews screen sits behind Google/Apple OAuth sign-in, which the autonomous browser cannot cross. Authenticated Steward resolution flows remain MANUAL TEST (no OAuth/II browser testing).
