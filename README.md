# Frame Studio

A private browser studio for designing animated broadcast graphics and building operator control panels.

## Use the studio

- **Design:** create scenes; add text, rectangles, ellipses, and uploaded images; select and drag unlocked layers; edit typography, size, position, rotation, color, opacity, corners, and shadows. Layer ordering, visibility, duplication, undo, and redo are available. Export the visible frame as a transparent PNG.
- **Animate:** select a layer and property, choose an easing style, set its value, and add a keyframe at the playhead. Edit individual key values, scrub, or play the timeline. Entrance animation holds its last frame.
- **Data:** add a public HTTPS JSON GET endpoint, save optional authentication headers, and map JSON paths to layer text, image URLs, or colors. Refresh is manual or periodic while the editor is open. Missing fields retain existing content. API refresh changes the editable project; use Update live to publish those changes.
- **Panels:** switch between Build and Operate. Add buttons, toggles, text/number fields, dropdowns, or timers. Assign ordered actions: set/increase a variable, fetch data, stage a scene, TAKE, update live, hide, or wait. Actions can be conditional on a variable or an equality expression. Button keyboard shortcuts operate only in Operate mode. Timer values run while their panel is open; use an update action to publish variable changes.
- **Football:** choose a player, stage a profile/card, increase scores, or select/drag a bench player onto a field player. A substitution changes the roster only after TAKE. Formation presets are 4-3-3 and 4-4-2. Player names, numbers, and photo URLs are editable.
- **On air:** Preview is a snapshot separate from Program. TAKE starts the staged graphic's animation. Update live keeps the animation position. Hide fades out over half a second. Open output displays only the transparent graphic in a separate browser window.

Text layers and image URLs support double-brace shared variables, for example {{playerName}} and {{playerPhoto}}. Buttons can update those variables before staging a graphic.

Projects autosave after edits settle, and Save writes immediately. Projects and output state live in D1; uploaded PNG/JPEG/WebP images live in R2. JSON import/export preserves project structure but references uploaded assets in this site; it does not bundle media or saved API credentials. Export PNG requires remote images to allow cross-origin access; uploading the image avoids that restriction.

## Scope of this release

This is a working first release, not Photoshop, After Effects, or Ross XPression feature parity. It has a 2D vector/text/image renderer and keyframes, not pixel painting, PSD/AEP import, 3D, audio/video compositing, expression scripting, or SDI/NDI output. Output is browser rendered and polls the private Program channel roughly every 400 ms; it is not frame-locked broadcast hardware output. Keep output signed in to the same account. There is one Program channel per account, shared across projects. Use one live operator to avoid competing output commands.

The user must supply their actual data endpoint and credentials. Requests allow public HTTPS on port 443, disable redirects, time out after 10 seconds, and limit JSON to 2 MB. Images are limited to 10 MB. The project schema bounds scenes, layers, controls, and keyframes to keep documents manageable. A conflicting save from another window is rejected rather than overwriting it.

## Development

Node.js 22.13 or later is required. Install with npm ci, then use npm run dev. Portable previews use loopback and a development-only sign-in at /signin-with-chatgpt?return_to=/. The hosted site uses ChatGPT sign-in; local mock authentication is excluded from production.

Schema is declared in db/schema.ts. Generate migration changes with npm run db:generate. Production publication applies committed Drizzle migrations before the Worker starts. Local preview requires applying the migrations to the local DB using Wrangler with --local and --persist-to .wrangler/state. Runtime request handlers never create schema.

Run the TypeScript check with node node_modules/typescript/bin/tsc --noEmit. The browser integration check is tests/browser-smoke.cjs; point PLAYWRIGHT_PATH at an installed Playwright package and optionally configure TEST_BASE_URL and TEST_BROWSER. It exercises editing, persistence, conflict detection, PNG export, animation, custom controls, output, substitutions, a public API binding, uploads, authentication, and responsive layouts against local development data. It creates QA projects locally only.

Feature-detected WebMCP tools expose reading the open project and staging a scene without changing Program. Native WebMCP validation is unavailable in the local Edge test environment; the normal interface remains usable without that browser feature.

Publishing uses the Sites workflow and the project ID already recorded in .openai/hosting.json. Preserve owner-only access unless the owner requests a change. Do not commit local authentication, dependency caches, .wrangler state, or output screenshots.
