# Reliability and attachment decisions

## What already worked

Before this work (commit `e59adf6`), `RunRegistry.consumeRun` executed the
Codex turn on the Bridge independently of its SSE subscribers. Disconnecting
the stream closed a subscription; it did not abort the run controller. The
existing backend test `keeps a run alive after the SSE client disconnects`
verified that behavior. Once the Bridge had accepted a run, closing the mobile
app was therefore expected to leave the execution running **while the Bridge
process and Codex runtime stayed alive**. Explicit cancellation remained a
separate operation.

The new work strengthens recovery of the result in the mobile app. It adds
replay-gap detection, bounded subscriber resources, completed-run retention,
idempotent start requests, accepted client cursors, deduplication, stale-stream
detection and reconnection. These changes do not create the original
execution/subscription separation.

## Runs and connectivity

The Bridge owns a run independently of each SSE subscriber. It assigns
`event_seq` once per logical event and stores the last 5,000 events in a ring.
`since_seq` is the last event accepted by the client. Replay yields only later
events. A missing next event returns `replay_gap` (HTTP 409) with the retained
range. A subscriber has a cursor into the shared ring, so it has no private
event queue. A stalled subscriber eventually receives a gap and must reconnect;
each run permits at most 16 subscribers.

Terminal runs and their request IDs remain available for five minutes by
default. Expiration clears the record and buffer. This is process memory, so
a Bridge restart requires conversation transcript reconciliation. A missing
record or failed request is not evidence that a run completed.

The mobile starts a run with a generated `client_request_id` and observes it
through a separate GET stream. A repeated POST with the same key and body
returns the same run during retention, but the client does not automatically
repeat state-changing requests. If a start response is lost, it queries the
request ID and active runs. It keeps the draft and an unresolved status when
neither the registry nor transcript can prove the result.

The mobile accepts only the next sequence for a run. Older sequences are
ignored; a jump suspends event application and triggers transcript recovery.
The run ID maps to the existing assistant bubble, including after reattachment.
Stable run IDs keep ordinary active-run refreshes from restarting SSE.
Returning to the foreground triggers reconciliation. An attached stream is
considered stale after three heartbeat intervals plus five seconds without
any event or heartbeat. A four-second check watches active run liveness and
polls for recovery only when its stream is detached. The Bridge connection
controller alone owns health retries, with a
seven-second request timeout, capped 2–10 second backoff, and a foreground
probe. An HTTP response establishes Bridge reachability even when Codex is
unready.

## Message interaction

Copy all reads ordered text parts from the message model, excluding activity
and approval controls. Native Text selection handles fragments. The transcript
follows streamed content only while the user is within 64 pixels of the end.
User scrolling disables following; the jump button and a new conversation
restore it. Layout correction uses short, bounded retries and stops on manual
scrolling.

## Attachment boundary

The server generates an opaque ID for each upload and stores metadata in a
private sidecar file. The client never supplies a host path. A run resolves
only a known, unexpired ID in the configured directory. Resolution checks a
regular file, size and real path, and rejects symlinks. Upload writes use
exclusive creation with restrictive permissions. Base64, file size, aggregate
storage (512 MiB), file count (2,000), concurrent requests (two), and per-run
attachment count (five) are bounded. Interrupted writes without valid metadata
are removed during cleanup. PNG, JPEG and WebP require a matching
signature. Other files are passed as an untrusted reference, subject to normal
Codex tool and sandbox access. The SDK runtime does not advertise uploads.

Unused uploads expire after 24 hours. In-use files are pinned until their run
ends. Metadata survives restart; files marked in use receive another TTL
grace period, since the old process can no longer prove their run status.
Deletion accepts only server IDs and refuses pinned files. The upload API is
disabled on wildcard binds. On a specific WireGuard address it requires an
explicit opt-in; the supplied launcher verifies that address on the named
tunnel first. There is no HTTP authentication in the current Bridge, so any
peer able to reach that interface can invoke the API. Browser `Origin` headers
are rejected for upload and deletion, but this is not authentication.

The metadata, path and symlink checks limit accidental and direct path escape.
A hostile local process with write access to the upload directory could still
race file replacement after validation. The normal per-user directory
permissions and OS account boundary remain necessary. Generic binary formats
may require tools the selected Codex runtime or sandbox does not provide;
upload success alone does not imply content interpretation. No sandbox or
approval setting is expanded for attachments.

## Remaining risks and verification

| ID | Condition and effect | Current handling | Remaining work or limit |
| --- | --- | --- | --- |
| R-01 | The Bridge process stops or restarts during a run. The in-memory registry and potentially the Codex runtime process disappear. | The mobile reloads the persisted conversation and leaves an unproven outcome unresolved. | No durable run persistence is implemented. A Bridge restart cannot promise that the execution continues. Verify the exact transcript behavior with the deployed app-server. |
| R-02 | The app closes while the initial POST is in flight. It may not know whether the Bridge accepted the request. | A client request ID allows lookup and prevents duplicate starts while the Bridge retains that ID. The app does not automatically resend. | Request IDs are in memory on the Bridge. After a Bridge restart, an absent ID cannot prove the run never started; the user must inspect the conversation before retrying. |
| R-03 | A disconnected client misses more than the retained 5,000 events. Incremental replay would omit content. | The Bridge returns `409 replay_gap`; the mobile stops applying that stream and uses the transcript after a terminal result. | Live partial output cannot be reconstructed from an incomplete buffer. If the transcript cannot prove completion, the run remains unresolved. |
| R-04 | A phone or network leaves an SSE reader half open or slow. | Heartbeat liveness checks trigger recovery; subscribers share a bounded ring, have no private event queue and are limited to 16 per run. | The client may wait up to the liveness threshold (three heartbeat intervals plus five seconds) before detecting a silent socket. |
| R-05 | Any peer that can reach the Bridge can call its HTTP API, including uploads. | Uploads are disabled on wildcard binds and require an explicit opt-in on a specific non-loopback address; the supplied launcher checks the WireGuard interface. Upload endpoints reject browser `Origin` headers. | There is no HTTP authentication. The bind address and WireGuard peer access remain the security boundary; `Origin` rejection is not authentication. |
| R-06 | A local process with write access to the upload directory replaces a file between validation and runtime use. | Opaque IDs, private permissions, regular-file checks, real-path checks and symlink rejection prevent direct client path escape. | A local time-of-check/time-of-use race remains possible for a process with filesystem access to that directory. Protect the OS account and directory. |
| R-07 | An uploaded image has a recognized signature but corrupted contents, or a generic binary needs unsupported tooling. | PNG, JPEG and WebP are classified by signature; other files are passed as untrusted references without changing sandbox policy. The SDK runtime does not advertise uploads. | Signature checks are not full image decoding. App-server or agent tools may reject a malformed image or be unable to read or interpret a generic file. |
| R-08 | Android backgrounding, selection, scrolling and WireGuard transitions behave differently from automated tests. | Backend HTTP tests, mobile transition tests, typechecks and a debug APK build passed. | No Android device was connected for end-to-end verification. Exercise background/reconnect, delayed tunnel, copy/selection, scrolling and image/file runs on a device before release. |
| R-09 | Closing or terminating the mobile process discards its in-memory partial message and event cursor, even though an accepted run continues on the Bridge. | On reopening, the app discovers active runs and reloads the conversation; replay starts from sequence zero when no cursor survives. | If the replay window has expired, the app must wait for a reliable transcript. The display may be temporarily incomplete or unresolved; the backend execution itself is not cancelled by closing the app. |
