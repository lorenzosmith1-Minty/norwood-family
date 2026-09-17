// Lane-local Vitest configuration for the PocketIC backend lane.
//
// The runner spawns Vitest with `cwd` set to this directory, so this file is
// picked up automatically and applies to every lane test file. It exists for
// one reason: the lane's default 5000ms per-test timeout is too tight for the
// heavier tests, which install a canister (replaying the whole migration chain)
// and then drive several sequential update calls against the replica.
//
// When a single test exceeds the timeout, Vitest abandons it while its in-flight
// canister calls are still running. Those orphaned calls keep the replica busy,
// the next test's install queues behind them, and the failure cascades: one slow
// test turns into a wall of `fetch failed` / `Test timed out` failures that look
// like a dead backend but are really a scheduling pile-up. A timeout that
// comfortably exceeds the real work removes that cascade without weakening a
// single assertion.
//
// The value is deliberately generous rather than tuned to the current machine:
// the lane runs against a shared sidecar whose load varies with whatever else
// the platform is doing, and a test that legitimately needs 6s under load must
// not be reported as a product failure. A genuinely hung call still fails — it
// just fails on its own merits instead of taking the rest of the file with it.
//
// This is a plain object rather than `defineConfig(...)` from `vitest/config`
// on purpose. `vitest` is installed in the frontend package, and a bare import
// of it from `app/test/` does not resolve — the same resolution asymmetry the
// lane runner documents for `@dfinity/pic`. Vitest accepts a default-exported
// config object without the helper, so importing it would only break the lane.
export default {
  test: {
    // Node environment: the lane drives the canister over HTTP and never
    // touches the DOM. The runner also passes `--environment node`, which
    // agrees with this; stating it here keeps a focused `vitest run` from this
    // directory behaving the same way.
    environment: "node",
    // One file at a time. The runner already passes `--fileParallelism=false`
    // because every lane file creates its own PocketIC instance and the shared
    // sidecar cannot absorb several at once; restating it here means a focused
    // run from this directory is serialized too.
    fileParallelism: false,
    // 30s: an order of magnitude above the observed cost of the heaviest test
    // (the conflict-review setups, which install a canister and make a dozen
    // sequential calls) while still failing a genuinely wedged call well inside
    // the gate's budget.
    testTimeout: 30_000,
    // Installing a canister and replaying the migration chain is the slowest
    // single operation in the lane and happens in `beforeAll`; give hooks the
    // same headroom as the tests they set up.
    hookTimeout: 30_000,
  },
};
