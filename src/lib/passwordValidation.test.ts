import { describe, expect, it } from "vitest";
import {
  calculatePasswordStrength,
  hashPassword,
  passwordSchema,
  validatePasswordMatch,
} from "./passwordValidation";

describe("passwordSchema", () => {
  it("rejects passwords under 12 characters", () => {
    expect(passwordSchema.safeParse("Short1!").success).toBe(false);
  });

  it("rejects passwords missing a required character class", () => {
    expect(passwordSchema.safeParse("alllowercase123").success).toBe(false); // no upper/special
    expect(passwordSchema.safeParse("ALLUPPERCASE123!").success).toBe(false); // no lower
    expect(passwordSchema.safeParse("NoDigitsHere!!").success).toBe(false); // no digit
  });

  it("accepts a password meeting every requirement", () => {
    expect(passwordSchema.safeParse("Str0ng&Secure!Pass").success).toBe(true);
  });
});

describe("calculatePasswordStrength", () => {
  it("scores an empty password as weak with guidance", () => {
    const result = calculatePasswordStrength("");
    expect(result.level).toBe("weak");
    expect(result.score).toBe(0);
  });

  it("scores a long, varied password as strong", () => {
    const result = calculatePasswordStrength("Str0ng&Secure!Pass");
    expect(result.level).toBe("strong");
  });

  it("caps the score for known common passwords even if long", () => {
    const result = calculatePasswordStrength("password123");
    expect(result.score).toBeLessThanOrEqual(20);
  });
});

describe("validatePasswordMatch", () => {
  it("returns false for empty strings", () => {
    expect(validatePasswordMatch("", "")).toBe(false);
  });

  it("returns false when passwords differ", () => {
    expect(validatePasswordMatch("abc123", "abc124")).toBe(false);
  });

  it("returns true when passwords match and are non-empty", () => {
    expect(validatePasswordMatch("abc123", "abc123")).toBe(true);
  });
});

describe("hashPassword", () => {
  it("is deterministic for the same input", async () => {
    const a = await hashPassword("some-password");
    const b = await hashPassword("some-password");
    expect(a).toBe(b);
  });

  it("produces different hashes for different inputs", async () => {
    const a = await hashPassword("some-password");
    const b = await hashPassword("some-other-password");
    expect(a).not.toBe(b);
  });

  it("returns a 64-character hex string (SHA-256)", async () => {
    const hash = await hashPassword("anything");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
