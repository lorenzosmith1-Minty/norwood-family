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

- Backend and frontend document allowlists must stay in lockstep: src/backend/lib/input-validation.mo DOCUMENT_MIME_TYPES and src/frontend/src/lib/fileValidation.ts DOCUMENT_MIME_TYPES must contain the identical seven MIME types (application/pdf, text/plain, text/csv, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet).
- The #ArchiveDocument upload surface is the single validation policy shared by Archive document uploads (submitArchiveItem via archiveSurfaceFor) and every Research source upload (createSourceWithUpload), so expanding DOCUMENT_MIME_TYPES covers both surfaces with no per-endpoint change.
- Expanding a shared MIME allowlist requires auditing every existing test that asserts the old rejection; a stale PocketIC rejection test silently breaks the validation suite.
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
