/// Superseded by the canonical family-scoped `lib/mystery-scope.mo` in Tenancy
/// 1C-D4-A. This module is intentionally inert: exactly one implementation of
/// every Mystery read, mutation, and authorization check must exist, and that
/// implementation now lives in `lib/mystery-scope.mo`. Kept as an empty module
/// so no stale import can reintroduce the pre-tenancy single-family logic.
module {};
