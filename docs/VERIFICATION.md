# Community release verification

Verified on 15 September 2026.

The automated Node test suite covers quota-based coding key rotation, preserving interrupted output, refusing alternate coding models, respecting origin-wide access challenges, successful image accounting, failed or malformed image responses, cross-origin rejection, shared daily image capacity, persistent guest reservations, path traversal protection, static-file boundaries, and owner authentication.

Browser verification covered:

- Desktop at 1512 × 982, tablet at 820 × 1180, and phone at 390 × 844.
- Chromium and WebKit, including Safari-compatible IndexedDB storage using byte buffers instead of persisted Blob objects.
- Image style selection, generation response rendering, JPEG downloads, saving to Files, reload persistence, image previews from the library, and byte-for-byte download integrity.
- Importing and previewing a normal text file.
- Clearing image results and prompt text when the active account changes.
- Navigation between Tools, Files, Intelligence, Settings, Home, and Coding, with no provider names in visible status labels.
- Local owner login, saved coding projects after reload, an interactive isolated browser preview, profile display and sign-out.
- An unavailable image service produces an error rather than a substitute picture.

Live service checks produced a real generated image, general answers, reviewed learning hints, web answers with sources, and a working coding project whose preview button changed the page. Device layout/storage tests use a deterministic image fixture so each repeat does not require another generation request. The WebKit check is browser-engine emulation, not a test on a physical iPad.

These are point-in-time checks, not a guarantee of future upstream availability or an independent security audit. Generated scientific illustrations need human review before educational use.
