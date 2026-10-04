# Project Guidance

## User Preferences

- Do not begin Phase 4
- Apply only the smallest safe fix for any defect found
- No reseeding and no destructive migration; preserve all existing data
- Compile affected interfaces as needed; focused tenancy/isolation tests only; maximum 2 test retries
- No preview/browser automation
- Use the latest deployed/exported Norwood code as the source of truth
- Frontend + existing backend actions only; keep changes small and additive
- Preserve the existing Norwood visual language; do not redesign
- Use the existing centralized active familyId; never hard-code 'norwood'
- Neutral success and error wording; never expose technical error tags or private reasons to users
- No OAuth or Internet Identity browser testing; report authenticated browser checks as manual tests
- Membership-confirmation status copy uses plain family-facing language; never expose internal enum names in user-facing text
- Audit and small hardening only; do not

## Verified Commands

- **typecheck**: `pnpm typecheck`
- **fix**: `pnpm fix`
- **build**: `pnpm build`

## Learnings

- A Motoko string literal cannot contain an unescaped double quote; a `\"\"` inside a getApiDoc Markdown literal terminates the string and produces M0097. Escape as \"\".
- The generated-app cover for Phase 1D-A timed out twice (pnpm test exceeded 480s, then the tester session hit its 1800s limit); testing ran its course for this revision and the deploy proceeded with the automated tests not passing.
- The Phase 1D-A local-deploy preflight was inconclusive (local_deploy_failed): the PocketIC sidecar health check returned HTTP 503, so runtime behavior was not verified. This is a local-deploy runtime fault, not an application bug.
- The backend eligible list (listMyEligibleMembershipConfirmationsForFamily) can return cases whose confirmationState is not #AwaitingConfirmation (e.g. #ApprovedByRelative, a challengeable Active membership already confirmed by another relative), so MembershipConfirmationRequestCard gates its Confirm/Dispute actions on eligible.confirmationState and renders a read-only state for every non-AwaitingConfirmation state; the caller's own myDecision settle check still takes precedence.
- MembershipConfirmationState has five variants: AwaitingConfirmation (the only actionable one), ApprovedByRelative, RejectedByRelative, StewardReviewRequired, and ResolvedBySteward.
- The Phase 1D-B cover passed: frontend Vitest 286 files / 2567 tests; PocketIC backend lane 78 files / 825 tests; typecheck clean.
- The Phase 1D-B local-deploy preflight was inconclusive (external_boundary): the preview deployed and rendered (home page, Notifications empty state on desktop and mobile), but sign-in offers only Google/Apple OAuth, which the autonomous browser cannot cross, so the eligible-trusted-relative confirmation card and its actions remain MANUAL TEST (no OAuth/II browser testing).
- Phase 1D-C Steward membership review delta: MembershipReviewCaseCard now exposes exactly two actions (Approve/Reject) and renders resolved cases read-only in place; the page keeps a resolvedCases map merged with the backend list so a resolved case stays visible after the backend drops it.
- The membership-reviews section heading count must use visibleCases.length (backend unresolved cases merged with locally resolved cases), not reviews.length, so the count always matches the rendered cards.
- listReviewsForSteward returns both #StewardReviewRequired and #RejectedByRelative; frontend doc comments that mention only the former are stale.
- The Phase 1D-C cover passed: frontend Vitest 287 files / 2573 tests; PocketIC backend lane 78 files / 825 tests; typecheck clean.
- The Phase 1D-C local-deploy preflight was inconclusive (tester_error): the preview deployed and rendered the landing page, but the Steward review surface sits behind Google/Apple OAuth sign-in (no Internet Identity path) and the browser action channel was unavailable, so authenticated Steward resolution flows remain MANUAL TEST (no OAuth/II browser testing).
- Phase 1D-D membership-confirmation polish: MEMBERSHIP_CONFIRMATION_STATE_LABELS in src/frontend/src/types/ownership.ts is the single source of plain family-facing wording for all five membership-confirmation states; every membership surface (request card, Steward review card, applicant status card, pending shell, invite redemption, notifications, Steward reviews page) reads from it so the same state always reads the same way.
- RejectedByRelative renders as 'Disputed' (under Steward review), never as a final rejection; only ResolvedBySteward renders 'Approved/Rejected by Family Steward'.
- The Phase 1D-D cover passed: frontend Vitest 289 files / 2599 tests; typecheck clean; the PocketIC backend lane skipped with pocketic_sidecar_unreachable.
- The Phase 1D-D local-deploy preflight was inconclusive (local_deploy_failed): the PocketIC sidecar health check returned HTTP 503, so runtime behavior was not verified. This is a local-deploy runtime fault, not an application bug.
- Phase 3 multi-family isolation/tenancy audit (fresh run) found and fixed 10 isolation defects: 2 backend photo/gallery authorization defects (lib/family-authorization.mo canManagePersonPhotosForFamily and mixins/object-storage-api.mo isUnclaimedProfileForFamily used a bare profiles.get(personId) instead of TenancyLib.getProfileForFamily(profiles, familyId, personId); the latter exposed a claimed non-default-family portrait publicly) and 8 frontend defects where family-scoped hooks were called without the active family id and silently fell back to the default family (components/governance/ReviewRequestsTab.tsx, components/StewardActionBadge.tsx, components/RelationshipRequestForm.tsx, pages/FamilyStewardReviewPage.tsx, pages/FamilyStewardHubPage.tsx, pages/HeritageBranchPage.tsx, pages/ConversationPage.tsx, pages/AddMyselfPage.tsx).
- Family-scoped hooks that take an OPTIONAL familyId parameter (usePersonProfile, useMyProfileClaim, usePersonClaimStatus, useListProfileClaims, useListRelationshipRequests, useListConfirmedRelationships, useProposeRelationship, useRequestProfileClaim, useCreateMyself, useSearchPossibleMatches, useApprove/RejectProfileClaim, useApprove/Reject/SetPendingRelationshipRequest, usePhotos/useProfilePhoto/useAddPhoto/useRemovePhoto/useSetProfilePhoto) silently default to the default family when called with no argument; every caller must pass useFamilyScopedId().
- Hooks that read the active family internally (useActiveFamilyRecord, useMyMembershipStatus, useArchiveStorage, useBoard, useMessaging, useNotifications, useGovernance, useRecipes, useFamilyHistory, useResearchIntake, useMembershipConfirmation, useMembershipReviews, usePendingCount, useCanonicalPerson, useExploreFamily, useNavbarIdentity, useListArchivedProfileIds) are already correctly scoped and need no caller change.
- The canonical family-scope profile lookup is TenancyLib.getProfileForFamily(profiles, familyId, personId); a bare profiles.get(personId) is a tenancy defect because non-default families key profiles as familyId::personId.
- test/pocketic/family-scoped-authorization.behavior.test.ts statically asserts the literal source substring 'p.familyId != familyId' inside canManagePersonPhotosForFamily; keep that explicit gate when refactoring the predicate.
- The Phase 3 closeout report lives at docs/phase-3-tenancy-audit-closeout.md with all 13 requested sections.
- The Phase 3 cover passed: frontend Vitest 292 files / 2615 tests; PocketIC backend lane 79 files / 829 tests against the real wasm; typecheck clean.
- The first Phase 3 cover attempt timed out (pnpm test exceeded 480s); the retry passed. The full suite is near the 480s timeout, so prefer targeted test runs when only a subset changed.
- The Phase 3 local-deploy preflight passed (validated): the default route rendered the full Norwood landing page with no blank screen, and the core surfaces (Archive, History, Notifications, Heritage Branch sign-in gate, Add Myself search) each rendered correctly on desktop and mobile with no console errors or canister rejects.
