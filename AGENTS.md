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

- ArchiveDetailPage routes documents through isPreviewableDocument (PDF || raster image); Office/CSV types fall through to a download-only document card with filename and Download Original and are never rendered inline.
- The local-deploy autonomous tester has no document file fixtures (only a PNG), so document upload acceptance and PDF preview flows cannot be exercised in local preflight and remain manual tests.
- ArchiveDetailPage branch order is load-bearing: isOfficeDocument must be evaluated before isTextType, because TEXT_TYPES includes Research, WorkBusiness, and Other, which the backend maps to the archive-document surface.
- The local-deploy autonomous tester has no document file fixtures (only a PNG), so document upload acceptance, PDF preview, and the Office download card cannot be exercised in local preflight and remain manual tests.
- The Pending Contributions badge (getPendingContributionsCount) and listPendingArchiveItems must share the same Research-linked id set, both built from researchSources' archiveItemId values, or the badge and the list disagree.
- ArchiveLib.listPending and PendingCountLib.countPending both take a Set.Set<ArchiveItemId> of Research-linked ids; the steward-gated mixins build that set from researchSources.
- ArchiveLib.transitionStatus(items, id, status) is a notification-free, #Pending-only status transition; approveSource/rejectSource use it to cascade to the linked Archive item so one Steward decision resolves both records.
- ArchiveApi and PendingCountApi mixins receive researchSources as an extra parameter; main.mo passes researchSources to ArchiveApi, ResearchIntakeApi, and PendingCountApi.
- api-doc.mo describes getPendingContributionsCount in two places (method reference ~line 749 and prose ~line 2100); a behavior change must update both.
- The PocketIC backend lane executes when the compiled wasm is present; the full root gate is `pnpm test` and it runs both the frontend and backend lanes.
- Tenancy 1B made the family-scoped authorization helpers canonical (isActiveStewardForFamily, hasActiveStewardForFamily, isApprovedFamilyMemberForFamily, requireApprovedFamilyMemberForFamily, requireActiveStewardForFamily, canManagePersonPhotosForFamily, requirePhotoMutationAuthorityForFamily, requireGalleryReadAuthorityForFamily, claimStewardForFamily) in lib/steward-authority.mo and lib/family-authorization.mo; the legacy single-family helpers are thin temporary wrappers delegating with FamilyTypes.DEFAULT_FAMILY_ID.
- The family-scoped helpers are internal Motoko functions not reachable through Candid, so they are covered by static/behavioral source tests in test/pocketic/ rather than PocketIC public-API calls; Tenancy 1C will move endpoints onto them.
- The Steward-access denial message is 'Unauthorized: Only Family Stewards can perform this action'; requireActiveStewardForFamily reuses it so denial behavior is unchanged.
- The PocketIC backend lane can fail with fetch failed / ECONNREFUSED / Server busy / pocketic_sidecar_unreachable; that is shared-sidecar instability, not a product regression — rerun the lane.
- The only authentication path is Google/Apple OAuth, so signed-in Steward, membership, photo-ownership, and bootstrap outcomes cannot be exercised in local preflight and remain manual tests.
- Tenancy 1C-A moved the profile/claim/relationship/photo endpoints onto explicit familyId scoping: the canonical endpoints are the *ForFamily variants (getPersonProfileForFamily, getMyProfileForFamily, listProfilesForFamily, listClaimDiscoveryProfilesForFamily, requestProfileClaimForFamily, listProfileClaimsForFamily, getMyProfileClaimForFamily, approve/rejectProfileClaimForFamily, searchPossibleMatchesForFamily, createMyselfForFamily, proposeRelationshipForFamily, listRelationshipRequestsForFamily, getMyRelationshipRequestsForFamily, approve/reject/setPendingRelationshipRequestForFamily, updateOwnProfileForFamily, removeDuplicateProfileForFamily, hasApprovedOwnerForFamily, canClaimProfileForFamily, getRelationshipRequestForFamily, listConfirmedRelationshipsForFamily, listPhotosForFamily, addPhotoForFamily, setProfilePhotoForFamily, getProfilePhotoForFamily, removePhotoForFamily); the legacy single-family endpoints remain as TEMPORARY wrappers delegating with DEFAULT_FAMILY_ID.
- Family-qualified storage keys are migration-compatible: the DEFAULT family keeps the legacy bare personId key for profiles and galleries so existing Norwood data is read/written in place, and every non-default family uses FamilyTypes.familyPersonKey(familyId, personId) (familyId::personId). lib/tenancy.mo owns profileKey/putProfileForFamily/removeProfileForFamily; lib/object-storage.mo owns the gallery equivalent.
- getProfileForFamily reads via the family-qualified key and still verifies profile.familyId == familyId after the lookup, so a stale or mis-keyed record can never leak across families.
- The frontend FamilyContext is the single source of the active familyId; familyScopedId is undefined for DEFAULT_FAMILY_ID='norwood' so the default family routes through the legacy endpoints and keeps byte-identical call shapes, while non-default families route through the *ForFamily endpoints.
- The frontend characterization tests freeze the legacy no-familyId call shapes and the exact two-element React Query keys ['photos', personId] / ['profilePhoto', personId] for the default family, so family-scoped wiring must be additive: hooks take an optional familyId and a shared photoQueryKey helper emits the legacy key when familyId is undefined.
- updateOwnProfileForFamily gates the Steward edit path on the profile being unclaimed: a non-owner Steward may edit only an unclaimed/historical profile, and a claimed profile returns #NotOwner, matching pre-refactor behavior.
- approveClaimForFamily's governance audit summary must include the affected person id ('Approved a profile claim for ' # claim.personId) to match the pre-change text consumed by backend-review.test.ts.
- The backend exposes no family-scoped Steward-authority endpoints, so useStewardAuthority keeps calling isCallerSteward/hasActiveSteward/claimSteward with no arguments.
- The PocketIC backend lane can fail with pocketic_sidecar_unreachable; that is shared-sidecar instability, not a product regression — rerun the lane.
- governance.mo still reads/writes profiles by bare personId (lines 435, 617); that is the excluded, not a regression, and belongs to a later Tenancy 1C build
