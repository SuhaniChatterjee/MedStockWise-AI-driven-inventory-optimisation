import "@testing-library/jest-dom/vitest";
import { webcrypto } from "node:crypto";

// Node 18 (this project's pinned runtime) doesn't expose crypto.subtle as a
// global the way real browsers and Node 20+ do, and jsdom's own subtle
// implementation is incomplete. hashPassword() (src/lib/passwordValidation.ts)
// relies on it, so polyfill for tests only -- production code always runs in
// a real browser, where Web Crypto is natively available.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}
