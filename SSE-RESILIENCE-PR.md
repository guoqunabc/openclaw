# PR: Resilient SSE parsing for proxied Anthropic API streams

## Problem

When using Anthropic API through Azure (or similar reverse proxies like CloudFlare, nginx), the SSE streaming responses can be malformed in two ways, causing openclaw agent runs to crash with `isError=true`:

### 1. SSE data line truncation

Azure proxy has a fixed buffer size limit. SSE `data:` lines exceeding this length get truncated and padded with spaces:

```
data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"journalctl --user -u openc      }
data: {"type":"conten           }
```

### 2. Raw newlines in thinking_delta break SSE framing

When `reasoning: true` (extended thinking), the `thinking_delta` content may contain literal newline characters. Azure proxy forwards these without proper SSE escaping, causing a single `data:` line to be split into multiple SSE events:

```
data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"created_at` can"
event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"createdin providers.items():\\n    for"}           }
```

### Impact

- 4 occurrences in 9 hours of runtime
- Each occurrence terminates the entire agent run (`isError=true`)
- User gets no response at all
- Memory accumulates to 2.3GB (possible leak from unclean stream termination)

## Root Cause Analysis

Error propagation chain:

```
@anthropic-ai/sdk Stream.fromSSEResponse()
  → JSON.parse(sse.data) throws on malformed data
  → async generator throws, stream dies

@mariozechner/pi-ai anthropic provider
  → for await (const event of anthropicStream) catches error
  → emits {type: "error", stopReason: "error"}

openclaw pi-embedded-runner
  → sees error event → marks isError=true → terminates run
```

The fundamental issue: `@anthropic-ai/sdk/core/streaming.js` calls `JSON.parse(sse.data)` without any error handling. A single malformed SSE event kills the entire stream, even though the rest of the content may be perfectly fine.

## Log Evidence

File: `/tmp/openclaw/openclaw-2026-02-27.log`

| Time                | Line        | Error Type                         |
| ------------------- | ----------- | ---------------------------------- |
| 2026-02-27 09:05:59 | 5897-5898   | Data truncation (input_json_delta) |
| 2026-02-27 16:45:43 | 10221-10222 | Data truncation (severe, "conten") |
| 2026-02-28 00:17:10 | 11386-11387 | Newline in thinking_delta          |
| 2026-02-28 01:07:09 | 11619-11620 | Newline in thinking_delta          |

Error source in compiled code: `subsystem-DypCPrmP.js:1012`

## Proposed Fix

### Option A: Patch `@anthropic-ai/sdk` (via patch-package)

Modify `@anthropic-ai/sdk/core/streaming.js` to wrap `JSON.parse(sse.data)` in a try-catch. On parse failure, log a warning and skip the malformed event instead of throwing:

```js
// Before (current behavior):
const data = JSON.parse(sse.data);

// After (resilient behavior):
let data;
try {
  data = JSON.parse(sse.data);
} catch (e) {
  console.warn(`[anthropic-sdk] Skipping malformed SSE event: ${e.message}`);
  continue; // skip this event, don't kill the stream
}
```

### Option B: Handle in pi-ai's anthropic provider

Instead of letting the `for await` loop throw on stream errors, implement per-event error handling with a retry/skip strategy.

### Option C: Handle in openclaw's embedded runner

When `stopReason === "error"` and partial content exists, attempt to use partial content instead of marking the entire run as failed. Optionally retry the request.

### Recommendation

**Option A is the most effective** - it addresses the root cause at the lowest level. Combined with Option C for defense-in-depth, this would make openclaw robust against any proxy-induced SSE corruption.

## Why this matters

- Azure AI is a major Anthropic API provider; many users route through proxies
- CloudFlare, nginx, and other reverse proxies may exhibit similar buffering behaviors
- Extended thinking (reasoning mode) is increasingly popular, making the newline issue more frequent
- A single malformed byte should never crash an entire agent conversation
