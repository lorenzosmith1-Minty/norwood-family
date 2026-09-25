/// Superseded by `mixins/recipes-scope-api.mo` in Tenancy 1C-D1.
///
/// The canonical family-scoped Recipes public API and its TEMPORARY Tenancy 1C
/// compatibility wrappers now live in `mixins/recipes-scope-api.mo`, which is
/// the single source of truth for every recipe endpoint and authorization
/// check. This mixin is intentionally inert so exactly one implementation
/// exists; it is no longer included by `main.mo`.
mixin () {};
