# Project Guidance

## User Preferences

- Phase 3 multi-family isolation/tenancy is complete; Phase 4 is authorized
- Do not begin Phase 4B
- Additive migration only; no reseeding and no destructive migration; preserve all existing Norwood data
- Reuse existing family-scoping and Steward authorization patterns
- Focused Phase 4A recovery tests only; maximum 2 test retries; no full app test suite; no preview/browser automation
- Do not delete the old account record solely because recovery succeeded
- Use the existing centralized active familyId; never hard-code 'norwood'
- Neutral success and error wording; never expose technical error tags or private reasons to users
- Preserve the existing Norwood visual language; do not redesign

## Verified Commands

- **typecheck**: `pnpm typecheck`
- **fix**: `pnpm fix`
- **build**: `pnpm build`

## Learnings

- The first Phase 3 cover attempt timed out (pnpm test exceeded 480s); the retry passed. The full suite is near the 480s timeout, so prefer targeted test runs when only a subset changed.
- The Phase 3 local-deploy preflight passed (validated): the default route rendered the full Norwood landing page with no blank screen, and the core surfaces (Archive, History, Notifications, Heritage Branch sign-in gate, Add Myself search) each rendered correctly on desktop and mobile with no console errors or canister rejects.
- Phase 4A recovery foundation (backend + types only) is complete: src/backend/types/recovery.mo, src/backend/lib/recovery.mo, src/backend/mixins/recovery-api.mo, additive migration src/backend/migrations/20261008_000000.mo, OQL entities recoveryRequest/recoveryVerification/recoveryAuditLog with canSeeRecovery family-scoped row visibility, and focused tests test/pocketic/recovery.cover.test.ts.
- Recovery public API: requestRecoveryForFamily, approveAccountRecoveryForFamily, verifyStewardRecoveryForFamily, rejectRecoveryForFamily, getRecoveryRequestForFamily, listRecoveryRequestsForFamily, listRecoveryVerificationsForFamily, listRecoveryAuditForFamily.
- The recovery request type is derived server-side: #AccountRecovery when a usable active Steward exists, otherwise #StewardRecovery (2-member quorum). The usable-Steward predicate must exclude the candidate (caller, ownerAccountId, and replacementAccountId), or a sole Steward recovering their own profile is misclassified #AccountRecovery and becomes unapprovable.
- Atomic ownership transfer reuses the existing profile record and retargets the existing #Active FamilyMembership to the replacement account; it deactivates the old owner's #Active membership (set #Left, preserving the record) before activating the replacement's, so exactly one #Active membership owns a Person/Profile. It never creates a duplicate Person or membership and never deletes the old account.
- Replay safety is enforced by transferredAt plus isResolved(status): a resolved request returns #AlreadyResolved before any transfer, so a completed recovery can never execute the transfer twice.
- requestRecoveryForFamily requires the caller to be an approved family member, active Steward, or #Active membership holder in familyId; a family founder holds an #Active membership but no #Approved claim, so the gate must also accept hasActiveMembershipForFamily.
- Caffeine bindgen assigns positional Result_N aliases by first-appearance order of distinct Result<Ok,Err> shapes in the .did; adding new Result-returning endpoints inserts new shapes and shifts every later alias, so hand-written consumers that hard-code Result_N break. Remap consumers using the shape-based bijection, not a uniform shift.
- `actor` is a reserved keyword in Motoko and cannot be used as a parameter or identifier name (M0001); rename such parameters.
- The PocketIC lane shares one sidecar; a single test file that installs too many canisters exhausts its pid ceiling and later tests fail with `fetch failed`. Keep installs bounded (one per test).
- The full root test suite runs near the 480s timeout; prefer targeted test runs when only a subset changed.
- Phase 4A-H1 recovery hardening: replacement-account eligibility for recovery accepts an #Active family membership (FamilyMembershipLib.hasActiveMembershipForFamily) in addition to an approved member (FamilyAuthorizationLib.isApprovedFamilyMemberForFamily) via the isEligibleReplacement helper, applied at request, approval, and quorum re-check; a principal with no family relationship is still refused.
- Steward authority transfer on recovery is implemented by reassignStewardForFamily in src/backend/lib/steward-authority.mo, which retargets the existing ACTIVE StewardRecord's stewardAccountId in place (family-qualified, matching the OLD principal, with the roleStatus == #Active guard), never creating a second record; it runs inside transferOwnership's transferredAt replay guard so a completed recovery cannot transfer authority twice.
- In-place list rewrites that mirror a preceding find predicate must repeat every guard from that predicate; reassignStewardForFamily's rewrite loop must include the roleStatus == #Active guard or a preserved #Removed record for the same principal is converted into a duplicate #Active replacement record.
- transferOwnership must retarget Steward authority from the profile's current claimedByUserId re-read under family scope, not the request-time ownerAccountId, because approveClaimForFamily can reassign an open profile.
- No new stable field was required for Phase 4A-H1, so no migration file was added; the existing 20260829/20261007/20261008 chain remains the tail.
- The focused recovery PocketIC lane runs with `node test/pocketic/run-backend-lane.mjs recovery.cover`; the positional filter selects the single file and the runner keeps --fileParallelism=false.
- The Phase 4A-H1 local-deploy preflight was inconclusive (auth): the preview deployed, but the app exposes only Google/Apple OAuth sign-in (no Internet Identity path), so no signed-in replacement or Steward account could be established to exercise recovery, Steward authority transfer, security rules, or the focused Phase 4A scenarios. Authenticated recovery flows remain MANUAL TEST.
- Phase 4A-H2 self-service recovery request initiation: requestRecoveryForFamily no longer requires the caller to be a family member; the caller IS the replacement account, so replacementAccountId must equal caller (else #NotAuthorized), the target must be an existing claimed family-scoped profile (claimedByUserId != null), and ownerAccountId is derived from the profile.
- Approval-time and quorum-time replacement eligibility uses the new isEligibleReplacementForRequest helper, which accepts the request's own replacementAccountId (the self-service caller) without a membership and otherwise falls back to isEligibleReplacement; unrelated principals are still refused.
- No migration was needed for Phase 4A-H2: RecoveryRequest already carries ownerAccountId, replacementAccountId, and requestedByAccountId, so relaxing the request-creation gate changed no stable field.
- The focused recovery PocketIC lane runs with `node test/pocketic/run-backend-lane.mjs recovery.cover`; it passed 27/27 against the real wasm, and the full gate passed (frontend 295 files/2686 tests; backend lane 80 files/856 tests).
- The shared PocketIC sidecar saturates under load and produces transport-level failures (fetch failed / SocketError: other side closed / 30s timeouts) that are not assertion failures; the failing set moves between identical runs, so re-run once the sidecar recovers rather than treating it as a backend defect.
- The Phase 4A-H2 local-deploy preflight was inconclusive (auth): the preview deployed, but the app exposes only Google/Apple OAuth sign-in (no Internet Identity path), so no signed-in replacement or Steward account could be established to exercise recovery. Authenticated recovery flows remain MANUAL TEST.
