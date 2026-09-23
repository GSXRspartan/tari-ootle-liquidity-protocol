# EXTENSION SECURITY

## Threat model
- Malicious website requests transaction approval.
- XSS injects malicious transaction parameters.
- Dependency compromise introduces malicious code.
- Spoofed origin attempts to trick user.
- Replay of previous signed transaction.
- Overbroad site permissions.

## Defenses
- Independent preview: adapter displays full manifest (component, resources, amounts, fee, max epoch) before signing.
- Explicit site permissions: user grants per-site; can revoke at any time.
- Auto-lock: extension locks after configurable inactivity; key material cleared.
- Message isolation: content script communicates through standard message port; origin is verified.
- No seed exposure: raw seed never sent to content script or web page.
- Dependency pinning: extension build uses committed lock files.

## Implementation notes (scaffold)
- Service worker handles background message routing.
- Popup provides user-facing approval/rejection UI.
- Content script detects dApp connection requests and forwards to service worker.
- Full transaction manifest display is required before signing.
- Rejection must return an explicit error to the dApp (not a silent failure).
