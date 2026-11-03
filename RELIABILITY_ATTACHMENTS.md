# Reliability and attachment decisions

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
