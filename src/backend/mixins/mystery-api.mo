/// Superseded by the canonical family-scoped `mixins/mystery-scope-api.mo` in
/// Tenancy 1C-D4-A. This mixin is intentionally inert: exactly one
/// implementation of every Mystery endpoint must exist, and that implementation
/// now lives in `mixins/mystery-scope-api.mo`. Kept as an empty mixin so no
/// stale include can reintroduce the pre-tenancy single-family endpoints.
mixin () {};
