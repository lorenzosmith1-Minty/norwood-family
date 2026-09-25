/// Superseded by `lib/recipes-scope.mo` in Tenancy 1C-D1.
///
/// The family-scoped Recipes domain logic now lives in `lib/recipes-scope.mo`,
/// which is the single source of truth for every recipe read, mutation, and
/// family-boundary predicate. This module is intentionally inert so exactly one
/// implementation exists; it is no longer imported by `main.mo`.
module {};
