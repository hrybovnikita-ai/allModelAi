/** Shared bootstrap inflight flag — isolated to avoid firebase/socialSignIn import cycles. */
let bootstrapInflight = null;

export function getAuthBootstrapInflight() {
  return bootstrapInflight;
}

export function setAuthBootstrapInflight(promise) {
  bootstrapInflight = promise;
}

export function invalidateAuthBootstrap() {
  bootstrapInflight = null;
}

export function resetAuthBootstrapForTests() {
  bootstrapInflight = null;
}
