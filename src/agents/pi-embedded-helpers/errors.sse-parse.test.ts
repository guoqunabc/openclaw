import { describe, expect, it } from "vitest";
import { isLikelySSEParseError } from "../pi-embedded-helpers.js";

describe("isLikelySSEParseError", () => {
  it("returns false for undefined/empty input", () => {
    expect(isLikelySSEParseError(undefined)).toBe(false);
    expect(isLikelySSEParseError("")).toBe(false);
  });

  it("detects SyntaxError + JSON context", () => {
    expect(isLikelySSEParseError("SyntaxError: Unexpected end of JSON input")).toBe(true);
    expect(isLikelySSEParseError("SyntaxError: Unexpected token < in JSON at position 0")).toBe(
      true,
    );
    expect(isLikelySSEParseError("Syntax error while parsing SSE stream JSON data")).toBe(true);
  });

  it("detects unexpected end of JSON without SyntaxError prefix", () => {
    expect(isLikelySSEParseError("Unexpected end of JSON input")).toBe(true);
  });

  it("detects unexpected token + JSON context", () => {
    expect(isLikelySSEParseError("Unexpected token } in JSON at position 42")).toBe(true);
  });

  it("detects unterminated string in JSON", () => {
    expect(isLikelySSEParseError("Unterminated string in JSON at position 100")).toBe(true);
  });

  it("detects bad control character in string literal + JSON", () => {
    expect(
      isLikelySSEParseError("Bad control character in string literal in JSON at position 5"),
    ).toBe(true);
  });

  it("detects Anthropic SDK SSE-specific patterns", () => {
    expect(isLikelySSEParseError("Could not parse SSE event")).toBe(true);
    expect(isLikelySSEParseError("Failed to parse SSE data")).toBe(true);
    expect(isLikelySSEParseError("malformed SSE event from proxy")).toBe(true);
  });

  it("detects JSON parse errors from SSE stream context", () => {
    expect(isLikelySSEParseError("SyntaxError: Unexpected end of JSON input from SSE stream")).toBe(
      true,
    );
    expect(
      isLikelySSEParseError("SyntaxError: Unexpected token < in JSON at position 0 (stream)"),
    ).toBe(true);
  });

  it("detects expected property name errors", () => {
    expect(
      isLikelySSEParseError("Expected double-quoted property name in JSON at position 12"),
    ).toBe(true);
  });

  it("detects expected comma or brace errors", () => {
    expect(
      isLikelySSEParseError("Expected ',' or '}' after property value in JSON at position 50"),
    ).toBe(true);
  });

  it("does not match context overflow errors", () => {
    expect(isLikelySSEParseError("context length exceeded")).toBe(false);
    expect(isLikelySSEParseError("request_too_large")).toBe(false);
    expect(isLikelySSEParseError("prompt is too long")).toBe(false);
  });

  it("does not match rate limit errors", () => {
    expect(isLikelySSEParseError("rate limit exceeded")).toBe(false);
    expect(isLikelySSEParseError("too many requests")).toBe(false);
  });

  it("does not match billing errors", () => {
    expect(isLikelySSEParseError("insufficient credits")).toBe(false);
    expect(isLikelySSEParseError("payment required")).toBe(false);
  });

  it("does not match generic non-JSON errors", () => {
    expect(isLikelySSEParseError("connection reset by peer")).toBe(false);
    expect(isLikelySSEParseError("ECONNREFUSED")).toBe(false);
    expect(isLikelySSEParseError("timeout")).toBe(false);
  });

  it("matches real-world Azure proxy truncation error", () => {
    expect(
      isLikelySSEParseError(
        "SyntaxError: Expected double-quoted property name in JSON at position 83 (line 1 column 84)",
      ),
    ).toBe(true);
  });

  it("matches real-world newline-in-thinking error", () => {
    expect(isLikelySSEParseError("SyntaxError: Unexpected end of JSON input")).toBe(true);
  });

  // Stack trace validation tests
  describe("stack trace narrowing", () => {
    const sseMessage = "SyntaxError: Unexpected end of JSON input";

    it("matches when stack contains streaming.js", () => {
      const stack =
        "SyntaxError: Unexpected end of JSON input\n" +
        "    at JSON.parse (<anonymous>)\n" +
        "    at Stream._fromSSEResponse (node_modules/@anthropic-ai/sdk/streaming.js:45:12)";
      expect(isLikelySSEParseError(sseMessage, stack)).toBe(true);
    });

    it("matches when stack contains anthropic SDK path", () => {
      const stack =
        "SyntaxError: Unexpected end of JSON input\n" +
        "    at JSON.parse (<anonymous>)\n" +
        "    at processChunk (node_modules/@anthropic-ai/sdk/core/streaming.mjs:120:30)";
      expect(isLikelySSEParseError(sseMessage, stack)).toBe(true);
    });

    it("matches when stack contains openai SDK path", () => {
      const stack =
        "SyntaxError: Unexpected end of JSON input\n" +
        "    at JSON.parse (<anonymous>)\n" +
        "    at Stream.parse (node_modules/openai/streaming.js:88:15)";
      expect(isLikelySSEParseError(sseMessage, stack)).toBe(true);
    });

    it("rejects generic JSON error with non-streaming stack", () => {
      const stack =
        "SyntaxError: Unexpected end of JSON input\n" +
        "    at JSON.parse (<anonymous>)\n" +
        "    at parseToolResult (src/tools/parser.js:42:20)\n" +
        "    at executeToolCall (src/tools/executor.js:100:10)";
      expect(isLikelySSEParseError(sseMessage, stack)).toBe(false);
    });

    it("rejects generic JSON error with config parsing stack", () => {
      const stack =
        "SyntaxError: Unexpected end of JSON input\n" +
        "    at JSON.parse (<anonymous>)\n" +
        "    at loadConfig (src/config/loader.js:15:25)";
      expect(isLikelySSEParseError(sseMessage, stack)).toBe(false);
    });

    it("still matches SSE-specific messages regardless of stack", () => {
      const nonStreamingStack =
        "Error: Could not parse SSE event\n    at someRandomPlace (src/foo.js:1:1)";
      expect(isLikelySSEParseError("Could not parse SSE event", nonStreamingStack)).toBe(true);
    });

    it("matches when no stack is provided (backwards compatible)", () => {
      expect(isLikelySSEParseError(sseMessage)).toBe(true);
      expect(isLikelySSEParseError(sseMessage, undefined)).toBe(true);
    });
  });
});
