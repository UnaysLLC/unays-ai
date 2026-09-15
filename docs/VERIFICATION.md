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

## Image routing and sidebar update

Common image requests such as “draw a robot,” “make me a logo,” and “I want a picture” now open image generation directly, including requests from the coding workspace. Code requests, prompt-writing requests and explanatory questions remain in their appropriate workspace. A live request from the chat composer produced an image in 3.05 seconds during verification; this is an observed result, not a speed guarantee.

Cancellation and a stalled-request timeout were verified with controlled browser requests. Both stop the loading state and preserve the prompt for retry. The upstream image request has a 45-second deadline and the browser has a 50-second deadline.

The recent-chat list now uses the sidebar's available height, with a wider sidebar and compact two-column navigation. Tests with 30 local sample conversations checked search, scrolling, opening the last chat, and coding navigation at desktop, laptop, iPad and phone sizes. Desktop history grew from 69px to 347px in the 1512 × 982 test viewport. These sample conversations exist only inside isolated test browser contexts.
