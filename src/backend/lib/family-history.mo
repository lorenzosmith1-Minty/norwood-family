/// Superseded by Tenancy 1C-D3-A.
///
/// The Story domain logic that used to live here is now the canonical
/// family-scoped `lib/family-history-scope.mo`. The Mystery domain logic that
/// used to live here is now `lib/mystery.mo`. This module is intentionally
/// inert so exactly one implementation of every Story and Mystery read,
/// mutation, and authorization check exists.
module {};
