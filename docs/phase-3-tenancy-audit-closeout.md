# Phase 3 Tenancy Audit — Closeout Report

**Scope:** Multi-family isolation / tenancy audit across the backend canister and the
React frontend.
**Discipline:** Audit and small hardening only. No new product features. Smallest safe
fix per defect. All existing data preserved. The centralized active `familyId` is the
single source of truth; `'norwood'` is never hard-coded. The existing Norwood visual
language is unchanged.

---

## 1. Surfaces Reviewed

The audit covered every surface where a family boundary can be crossed or where a
family-scoped value can silently fall back to the default family:

- **Members** — membership records, approval state, and member-scoped reads.
- **Person profiles** — profile lookup, claim state, and profile-scoped accessors.
- **Relationships** — relationship proposals, review, and resolution.
- **Invitations** — invitation issuance, token handling, and redemption.
- **Membership confirmations** — applicant reads, steward review, and resolution.
- **Steward review cases** — review queues, review actions, and audit history.
- **Notifications** — recipient targeting and family scoping.
- **Archive / history** — archive reads, contributions, and history reads.
- **Photos / media metadata** — gallery visibility, photo mutation authority, and
  unclaimed-profile portrait exposure.
- **Governance actions** — steward roster, removal, successor designation, warnings,
  and eligible-candidate reads.
- **Family switching / cached frontend state** — React Query keys and cache reuse
  across a family switch.
- **Backend authorization on family-scoped mutations** — `*ForFamily` endpoints and
  their legacy wrappers.
- **OQL row visibility** — whether queryable rows are constrained to the requesting
  family.

---

## 2. Isolation Defects Found

### 2.1 Backend defects (photo / gallery authorization path)

Two backend defects were found in the photo/gallery authorization path. Both used a
bare `profiles.get(personId)` lookup that ignored the family boundary:

1. **`lib/family-authorization.mo` — `canManagePersonPhotosForFamily`**
   Used a bare `profiles.get(personId)` instead of a family-scoped lookup. A caller
   authorized in one family could resolve a profile belonging to another family and
   act on its photos.

2. **`mixins/object-storage-api.mo` — `isUnclaimedProfileForFamily`**
   Used a bare `profiles.get(personId)`. Because the lookup ignored the family, a
   profile that was **claimed** but belonged to a **non-default family** was treated
   as **unclaimed**, which exposed its portrait publicly.

### 2.2 Frontend defects (family-scoped hooks without the active family id)

Eight frontend call sites invoked family-scoped hooks **without** passing the active
family id. Those hooks accept an optional `familyId` and silently default to the
default family when called with no argument, so each of these surfaces read or wrote
against the default family regardless of the active family:

- `components/governance/ReviewRequestsTab.tsx`
- `components/StewardActionBadge.tsx`
- `components/RelationshipRequestForm.tsx`
- `pages/FamilyStewardReviewPage.tsx`
- `pages/FamilyStewardHubPage.tsx`
- `pages/HeritageBranchPage.tsx`
- `pages/ConversationPage.tsx`
- `pages/AddMyselfPage.tsx`

---

## 3. Fixes Applied

### 3.1 Backend

Both bare lookups were replaced with the family-scoped accessor:

```motoko
TenancyLib.getProfileForFamily(profiles, familyId, personId)
```

- `lib/family-authorization.mo` — `canManagePersonPhotosForFamily` now resolves the
  profile through `TenancyLib.getProfileForFamily(profiles, familyId, personId)`. The
  explicit `p.familyId != familyId` gate was **retained** so a profile that resolves
  outside the requested family is still rejected.
- `mixins/object-storage-api.mo` — `isUnclaimedProfileForFamily` now resolves the
  profile through `TenancyLib.getProfileForFamily(profiles, familyId, personId)`, so a
  claimed non-default-family profile is no longer misclassified as unclaimed and its
  portrait is no longer exposed publicly.

### 3.2 Frontend

All eight call sites now pass the centralized active family id via
`useFamilyScopedId()`:

```tsx
const familyId = useFamilyScopedId();
```

No `'norwood'` literal was introduced anywhere; the active family id continues to come
from `context/FamilyContext.tsx`, the single source of truth.

---

## 4. Files Changed

### Backend (2)

- `src/backend/lib/family-authorization.mo`
- `src/backend/mixins/object-storage-api.mo`

### Frontend (8)

- `src/frontend/src/components/governance/ReviewRequestsTab.tsx`
- `src/frontend/src/components/StewardActionBadge.tsx`
- `src/frontend/src/components/RelationshipRequestForm.tsx`
- `src/frontend/src/pages/FamilyStewardReviewPage.tsx`
- `src/frontend/src/pages/FamilyStewardHubPage.tsx`
- `src/frontend/src/pages/HeritageBranchPage.tsx`
- `src/frontend/src/pages/ConversationPage.tsx`
- `src/frontend/src/pages/AddMyselfPage.tsx`

### Tests added (3)

- `src/frontend/src/FamilySwitchCacheIsolationCharacterize.test.tsx`
- `src/frontend/src/FamilyScopedSurfaceWiring.cover.test.tsx`
- `test/pocketic/photo-family-scope.cover.test.ts`

---

## 5. Family-Switch / Cache Findings

**Result: correct.**

- Family-scoped query keys include the family id. A family switch therefore produces a
  different query key, so React Query re-reads the backend for the new family and never
  serves the previous family's cached data.
- The default family keeps its legacy no-argument call and its bare (family-id-free)
  query key. This preserves existing default-family behavior and cache identity while
  non-default families are fully isolated.
- `context/FamilyContext.tsx` remains the single source of truth for the active
  `familyId`; `familyScopedId` is `undefined` for the default family, which is what
  routes hooks to the legacy endpoints.

---

## 6. Backend Authorization Findings

**Result: correct.**

- All `*ForFamily` endpoints guard with `requireApprovedFamilyMemberForFamily` /
  `requireActiveStewardForFamily` against the **requested** `familyId`, so a caller
  cannot act on a family they are not approved in or are not a steward of.
- Legacy wrappers delegate to the `*ForFamily` implementations with
  `FamilyTypes.DEFAULT_FAMILY_ID`. They therefore cannot reach another family — a
  legacy call is always scoped to the default family.

---

## 7. Notification Isolation Findings

**Result: correct.**

Notification reads and mutations are scoped by **recipient = caller AND familyId
match**. A caller only sees notifications addressed to them within the active family,
and notification mutations cannot cross the family boundary.

---

## 8. Invitation Isolation Findings

**Result: correct.**

- Invitations bind to the issuing family, so a redeemed invitation grants membership
  in the family that issued it and no other.
- The raw invitation token is returned **once** at issuance; only its **hash** is
  persisted. A leaked database value cannot be replayed as a usable token.

---

## 9. Membership-Confirmation Isolation Findings

**Result: correct.**

- Applicant-facing reads are **redacted** — an applicant sees their own confirmation
  state without exposure of steward-only review detail.
- Steward review and resolution are **family-scoped**, so a steward can only review and
  resolve confirmations belonging to the family they steward.

---

## 10. Profile / Relationship Isolation Findings

**Result: two defects found and fixed; remainder correct.**

- The two photo-path defects described in §2.1 were the only profile/relationship
  isolation defects found. Both are fixed (§3.1).
- All other profile, claim, and relationship accessors use `profileKey` /
  `getProfileForFamily`, so they resolve profiles within the requested family and do
  not cross the family boundary.

---

## 11. Compile Result

**Result: pass.**

- `mops check --fix` — pass
- `mops build` — pass
- `pnpm typecheck` — pass
- `pnpm fix` — pass
- `pnpm build` — pass

---

## 12. Focused Test Result

**Result: pass.**

- Frontend: **291 files / 2607 tests passed**
- Backend PocketIC lane: **79 files / 829 tests passed**

---

## 13. Remaining Manual Verification Items

- **Authenticated browser checks for family switching and cached-state isolation remain
  manual.** There is no OAuth / Internet Identity browser testing in this environment,
  so the end-to-end switch-and-observe flow (switch family, confirm the new family's
  data loads, confirm no previous-family data is served from cache) must be verified by
  a human in an authenticated browser session.
- **Two lower-severity, display-name-only bare lookups were intentionally left
  unchanged** under smallest-safe-fix discipline, because they do **not** leak
  cross-family data:
  - `lib/membership-confirmation.mo` — `listEligibleConfirmationsForFamily` /
    `listReviewsForSteward`
  - `mixins/board-scope-api.mo` — `notifyBoardMentions`

  These lookups resolve a display name only; they do not expose or mutate
  family-scoped records across the boundary, so changing them was out of scope for a
  smallest-safe-fix pass.
