import { normalizeState, sameValue, threeWayMerge } from "./core.js";

/** Share an in-flight operation. Call again after settlement to flush new edits. */
export function createSingleFlight() {
  let pending = null;
  function run(task) {
    if (pending) return pending;
    pending = Promise.resolve().then(task).finally(() => { pending = null; });
    return pending;
  }
  run.isRunning = () => pending !== null;
  return run;
}

function comparableState(input) {
  const value = normalizeState(input);
  delete value.updatedAt;
  delete value.updatedBy;
  return value;
}

export function hasStateChanges(left, right) {
  return !sameValue(comparableState(left), comparableState(right));
}

/**
 * A save acknowledgement belongs to the submitted snapshot, not necessarily the
 * currently displayed state: another expense may have been entered in flight.
 */
export function reconcileAck(submitted, current, server) {
  const result = threeWayMerge(submitted, current, server);
  return { ...result, dirty: result.conflicts.length > 0 || hasStateChanges(result.state, server) };
}
