import { describe, expect, it } from "vitest";
import { isFeishuBackoffError } from "./typing.js";

describe("isFeishuBackoffError", () => {
  it("returns true for HTTP 429 (AxiosError shape)", () => {
    const err = { response: { status: 429, data: {} } };
    expect(isFeishuBackoffError(err)).toBe(true);
  });

  it("returns true for Feishu quota exceeded code 99991403", () => {
    const err = { response: { status: 200, data: { code: 99991403 } } };
    expect(isFeishuBackoffError(err)).toBe(true);
  });

  it("returns true for Feishu rate limit code 99991400", () => {
    const err = { response: { status: 200, data: { code: 99991400 } } };
    expect(isFeishuBackoffError(err)).toBe(true);
  });

  it("returns true for SDK error with top-level code 99991403", () => {
    const err = { code: 99991403, message: "quota exceeded" };
    expect(isFeishuBackoffError(err)).toBe(true);
  });

  it("returns false for other HTTP errors (e.g. 500)", () => {
    const err = { response: { status: 500, data: {} } };
    expect(isFeishuBackoffError(err)).toBe(false);
  });

  it("returns false for non-rate-limit Feishu codes", () => {
    const err = { response: { status: 200, data: { code: 99991401 } } };
    expect(isFeishuBackoffError(err)).toBe(false);
  });

  it("returns false for generic Error", () => {
    expect(isFeishuBackoffError(new Error("network timeout"))).toBe(false);
  });

  it("returns false for null", () => {
    expect(isFeishuBackoffError(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isFeishuBackoffError(undefined)).toBe(false);
  });

  it("returns false for string", () => {
    expect(isFeishuBackoffError("429")).toBe(false);
  });

  it("returns true for 429 even without data", () => {
    const err = { response: { status: 429 } };
    expect(isFeishuBackoffError(err)).toBe(true);
  });
});
