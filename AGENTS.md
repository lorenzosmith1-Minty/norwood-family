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

- There is no useListMessages or createConversation hook in the Messaging frontend; the 13 hooks are the complete set (the backend methods exist but no frontend hook wraps them).
- No hard-coded 'norwood' family literal exists anywhere in Messaging frontend code; the only norwood literal in Messaging frontend source is DEFAULT_FAMILY_ID in context/FamilyContext.tsx.
- The Messaging family-wiring cover is src/frontend/src/MessagingFamilyScopedCallShape.cover.test.tsx (non-default family path) plus MessagingDefaultFamilyProviderCharacterize.test.tsx (default-family legacy call shapes and keys through the production FamilyProvider).
- The local-deploy autonomous tester cannot reach the family-scoped Messaging UI: family content sits behind a family-only gate whose only sign-in paths are Google/Apple OAuth, so the preflight reports inconclusive with auth and those runtime checks remain manual tests.
- Tenancy 1C-D1 family-scoped the Family Recipes backend: the canonical endpoints are the 9 *ForFamily methods in mixins/recipes-scope-api.mo with pure domain logic in lib/recipes-scope.mo; the legacy no-familyId recipe endpoints are TEMPORARY wrappers in that same mixin delegating with FamilyTypes.DEFAULT_FAMILY_ID.
- lib/recipes.mo and mixins/recipes-api.mo were superseded and emptied to inert stubs (module {}; / mixin () {};) with their imports/includes removed from main.mo, so exactly one implementation of every recipe read, mutation, and authorization check exists.
- Recipe family boundary is enforced by record.familyId predicates in lib/recipes-scope.mo; a foreign-family recipeId returns the existing safe not-found result (?null / []), never a distinguishable error that leaks family existence.
- isPersonInFamily returns true unconditionally for DEFAULT_FAMILY_ID, so any pre-tenancy originating-person existence guard must be re-added explicitly with TenancyLib.getProfileForFamily(profiles, familyId, personId) == null before requirePeopleInFamily; otherwise the TEMPORARY default-family wrappers silently accept a nonexistent originating person.
- transitionStatusForFamily must set updatedAt = Time.now() alongside status to preserve pre-tenancy approve/reject behavior.
- The migration 20260925_000000.mo adds familyId to recipes using the subset OldActor/NewActor form and backfills DEFAULT_FAMILY_ID; the OQL recipe entity in main.mo needed familyId added to both .sample and .payload.
- countPendingForFamily's recipe loop must filter on r.familyId == familyId like the archive loop; without it a Steward's pending-contributions count includes other families' pending recipes.
- Two mixins included in the same actor cannot declare an internal helper with the same name (M0051); the recipes linked-media helper is requireRecipeLinkedMediaInFamily to avoid colliding with the Board mixin's requireLinkedMediaInFamily.
- The pre-tenancy Recipe review flow emitted no notifications (OwnershipTypes.NotificationType has no recipe variants), so approve/reject emit none and the recipes mixin takes no notifications parameter.
- The local-deploy autonomous tester cannot reach the family-scoped Recipe UI: the recipe list and add-recipe entry points are gated behind sign-in whose only paths are Google/Apple OAuth, so the preflight reports inconclusive with auth and those runtime checks remain manual tests.
- Tenancy 1C-D2-A family-scoped the four Recipe read hooks in src/frontend/src/hooks/useRecipes.ts by forking on useFamilyScopedId() exactly like useBoard.ts/useMessaging.ts: undefined keeps the legacy no-familyId call and legacy key, else the *ForFamily method with familyScopedId first and appended to the query key.
- The Recipe read hook signatures (useApprovedRecipes, usePendingRecipes, useRecipe, useRecipesForPerson) are unchanged by family-wiring, so RecipesPage, RecipeDetailPage, AdminApprovalPage, and PersonProfilePage needed no edits.
- Recipe mutations (useSubmitRecipe/useApproveRecipe/useRejectRecipe/usePublishRecipe) were intentionally left on the legacy endpoints in D2-A per the exclusion contract; their ['recipes', ...] prefix invalidation already matches both the legacy and family-appended query keys. Mutation family wiring is deferred to D2-B.
- The four *ForFamily Recipe read methods (listApprovedRecipesForFamily, listPendingRecipesForFamily, getRecipeForFamily, listRecipesForPersonForFamily) already exist in the generated backend.d.ts/backend.ts bindings, so no bindgen change was needed.
- The Recipe family-wiring cover is src/frontend/src/RecipesFamilyScopedCallShape.cover.test.tsx (non-default branch) plus RecipesDefaultFamilyProviderCharacterize.test.tsx and RecipesReadFallbackCharacterize.test.tsx (default-family legacy call shapes/keys through the production FamilyProvider and the no-provider fallback).
- The local-deploy autonomous tester cannot reach the authenticated Recipe list: the browse screen renders its full UI chrome but listApprovedRecipes is rejected with IC0503 'Unauthorized: You must be signed in', which is the app's legitimate sign-in gate, so authenticated Recipe checks remain manual tests.
- Tenancy 1C-D2-B family-scoped the four Recipe mutation hooks in src/frontend/src/hooks/useRecipes.ts: useSubmitRecipe/useApproveRecipe/useRejectRecipe/usePublishRecipe fork on useFamilyScopedId() exactly like useBoard.ts/useMessaging.ts — undefined keeps the legacy no-familyId call, else the *ForFamily method with familyScopedId as the FIRST argument; hook signatures are unchanged so RecipeContributePage and AdminApprovalPage needed no edits.
- React Query invalidateQueries matches by key PREFIX, so a bare ['recipes','pending'] filter also matches ['recipes','pending',<otherFamily>]. Family-separated invalidation needs the bare queryKey PLUS a predicate (query) => query.queryKey[2] === familyScopedId; the shared recipeListInvalidation(kind, familyScopedId) helper in useRecipes.ts does this — default family keeps the exact legacy bare-prefix filter, non-default adds the predicate.
- The Recipe mutation family-separation cover is src/frontend/src/RecipesMutationFamilyScopedCallShape.cover.test.tsx (non-default branch: *ForFamily call shapes, no hard-coded norwood, family-separated invalidation) plus RecipesMutationFallbackCharacterize.test.tsx (no-provider legacy fallback and actor-not-ready guard).
- usePublishRecipe is family-wired but has no page consumer; the 'if used' criterion is satisfied at the hook level.
- The local-deploy autonomous tester cannot reach the authenticated Recipe surfaces: the browse screen renders but Add Recipe shows a 'Sign in to add a recipe' gate and /steward/approvals falls back to the public home page, so the preflight reports inconclusive with auth and those runtime checks remain manual tests.
