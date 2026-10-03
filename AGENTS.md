# Project Guidance

## User Preferences

- Frontend-only phases: change only the named layer, never refactor unrelated endpoints or domains in the same session
- Use the existing centralized active familyId; never hard-code 'norwood'
- Preserve the existing Norwood visual language (typography, beige/off-white surfaces, rounded cards/buttons, spacing); do not redesign
- Steward-facing review reads must be family-scoped and privacy-safe: never expose account principals, confirmer person ids, relationship ids, or sensitive relationship context
- Neutral success and error wording; never expose technical error tags or private reasons to users
- No OAuth or Internet Identity browser testing; report authenticated browser checks as manual tests

## Verified Commands

- **typecheck**: `pnpm typecheck`
- **fix**: `pnpm fix`
- **build**: `pnpm build`

## Learnings

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
- Backend methods requiring a non-optional string familyId must receive useActiveFamilyId(); useFamilyScopedId() is undefined for the default family and silently disables the call.
- PersonProfilePage invite action: canInvite gates on isAuthenticated && isLivingProfile && claimable && !isClaimedByAnother; the dialog calls useCreateFamilyInvitation with activeFamilyId, personId, and the trimmed email, and on success renders the one-time rawToken link via buildInviteUrl with a Copy Link button.
- useCreateFamilyInvitation resolves (never rejects) with a discriminated CreateFamilyInvitationResult so the dialog renders neutral copy per outcome (Created/AlreadyMember/RelationshipNotificationRequired/error).
- The Phase 1C-UI invite-action cover passed: frontend Vitest 278 files / 2492 tests; the PocketIC backend lane skipped with no_backend_wasm; typecheck clean.
- The Phase 1C-UI invite-action local-deploy preflight was inconclusive (external_boundary): the preview deployed and rendered, but the family tree and profile pages sit behind Google/Apple OAuth sign-in, which the autonomous browser cannot cross. Authenticated invite flows remain MANUAL TEST (no OAuth/II browser testing).
- PersonProfilePage canInvite now gates on isAuthenticated && isLivingProfile && claimable && !isClaimedByAnother && (isApprovedMember || isSteward), where isApprovedMember is membership?.status === MembershipStatus.Active from useMyMembershipStatus and isSteward is from useIsSteward.
- The invite dialog's onSuccess only calls buildInviteUrl when result.created.created && result.created.rawToken !== '', otherwise it sets inviteExisting to render neutral copy 'An invitation already exists for this family member.' / 'Create a fresh invitation link before sending it.'
- The invite dialog must branch on result.created.created === false / empty rawToken rather than changing useCreateFamilyInvitation's outcome mapping, because the tester-owned InvitationCreateHookContractCharacterize test freezes the hook's faithful pass-through of Created{created:false,rawToken:''} as {kind:'created'}.
- useMyMembershipStatus() is the approved-membership signal for the active family (membership?.status === MembershipStatus.Active); it tolerates a mock actor without getMyMembershipForFamily by resolving null, so a viewer with no membership read is treated as not approved.
- The Phase 1C-UI-H invite-hardening cover passed: frontend Vitest 282 files / 2522 tests; the PocketIC backend lane skipped with no_backend_wasm; typecheck clean.
- The Phase 1C-UI-H local-deploy preflight was inconclusive (external_boundary): the preview deployed and rendered, but sign-in offers only Google/Apple OAuth, which the autonomous browser cannot cross, and the family tree is private to approved members, so person profiles and the invite dialog are unreachable. Authenticated invite visibility and existing-invitation flows remain MANUAL TEST (no OAuth/II browser testing).
- The local deploy build prerequisite runs `caffeine check --fix` (biome) over the whole frontend including *.test.* files, so tester-owned test lint errors (noDelete, noUnusedVariables) block the local deploy even when production typecheck and build are clean; the tester must keep test files lint-clean.
