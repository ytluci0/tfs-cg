# Reusable graphics and smarter panels — BroadcastCG 0.13.0

This Windows release runs locally. It adds tools to the existing designer, panel builder and output engine. Project files keep their existing format and receive optional fields; accounts and stored projects stay in the separate application data directory.

## Responsive graphics

In **Design**, select a layer and expand **Responsive layout & clipping**.

- **Size to text** measures the current variable-filled text and adjusts the layer width within minimum/maximum bounds.
- **Fit around layer** makes a plate follow another layer's unrotated bounds, with padding.
- **After layer / Below layer** places a photo, label or other layer next to the target with a gap.
- Targets must belong to the same group. Circular links and missing targets are rejected on save. Fixed layers retain their normal keyframes; constraints override the affected position/size after animation evaluation.
- **Clip to layer** uses a rectangle, ellipse or vector shape as a clipping mask. Hide the mask shape if it should only clip other artwork. Mask geometry follows animation.

For a name strap, set its text layer to Size to text, its background to Fit around layer, and its photo to After layer. A longer API name then adjusts all three.

## Graphics from API rows

Open **Design → Graphic components & data layouts → Add data graphic**. Standings, leaderboard, lineup, statistics and bracket presets create a repeatable row group. Select any row layer and open **Group transform & data rows**.

Choose a saved API source, its array path and the fields to expose. A typical response is:

```json
{"rows":[{"name":"HOME","score":3,"photo":"https://example.org/team.png"}]}
```

Map `name` to `name`, `score` to `score`, and `photo` to `photo`. Remove unused field mappings if your response lacks them. Add a field to expose another value. Row text, images and colors accept `{{row.name}}`, `{{row.score}}`, `{{row.photo}}`, custom mapped fields and `{{row.rank}}`. Rank follows the selected sort order.

Edit the template row's normal graphic layers. Every repeated row receives those changes. Choose vertical, horizontal, grid or bracket placement, spacing, columns, limit, sort field and direction. Manual JSON rows are also available.

Refresh the source in **Data** or with a Fetch API action. Malformed row fields retain the preceding cached rows. Empty arrays intentionally clear the rows. Cached rows are saved and included in staged graphics, packages and output, so Program does not need to fetch an API itself. Refresh, Stage, then TAKE to publish a new snapshot; use Update live when appropriate.

Limits: 100 cached rows per group, 1,000 expanded layers per scene, no nested repeaters. Bracket placement arranges supplied rows as a binary tree; it does not infer tournament results or advance winners. Add separate text/photo layers and field mappings for each opponent as needed. Presets are editable starting layouts.

## Linked graphic components

Select 1–100 ungrouped layers. In **Graphic components & data layouts**, enter a component name and choose **Save selected graphic**. Insert it into any scene with **Insert linked**. An optional prefix creates separate variable names for each instance.

Edit a complete linked instance, select one of its layers and choose **Publish graphic changes**. Shapes, text templates, effects, geometry and animation update across linked instances. Each instance retains its variable prefix and insertion offset. This explicitly publishes changes; editing alone does not silently alter other scenes. **Detach graphic instance** makes it independent. Removing a component definition detaches its copies without deleting them.

This library is separate from the existing panel component library. A graphic component contains scene layers; a panel component contains operator controls.

## Drawing and group tools

- **Advanced drawing** adds up to 12 editable gradient stops and blend modes: normal, multiply, screen, overlay, darken, lighten, difference and exclusion.
- For vectors, select an anchor in the curve editor, choose **Add curve handles**, then drag its incoming and outgoing handles. **Make corner** restores a straight anchor. The existing point editor adds/removes/moves anchors.
- **Group selected layers** creates a scene group. Select a member to edit group translation, scale, rotation and origin. The Ungroup control explicitly discards the group's transform; use it only when that is the desired result.
- Layout relationships use unrotated boxes. Keep members in a shared coordinate group when aligning or connecting their bounds.

## Video, ticker and countdown layers

Use the **Video**, **Ticker** and **Countdown** toolbar controls. Their **Media & continuous animation** inspector configures them.

- Import a local MP4 or WebM, up to 50 MB. Set start time, speed and looping. Images retain their 10 MB limit. Imported videos are included in project packages, whose total size remains limited to 100 MB.
- Video is muted. There is no audio mixing or audio output. Codec support depends on the desktop runtime; test each production file. Transparent video requires a compatible alpha-encoded file.
- Tickers accept text and variables, scroll at a configured pixel speed, and repeat with a gap.
- Countdown graphics accept starting seconds or a numeric variable and count toward zero after TAKE. Existing managed match clocks remain the choice for operator start/pause/reset controls.
- Continuous media follows elapsed time after TAKE even when ordinary layer animation has reached its final keyframe. A new TAKE restarts it; Update live retains its clock. Named cues affect layer keyframes, while media continues on the TAKE clock.
- Output waits for video decoding before acknowledging the picture. A missing/unsupported video must be corrected before use. Hide a video layer before exporting a PNG; exporting a video frame as PNG is not provided in this release.

## Custom cards, drop zones and tabs

In **Panels → Build**, add **Widget** or change a control's type to **Custom cards / drop zone / tabs**. Connect a shared text variable for the selection. Under **Custom widget design**, choose its mode, columns, title, subtitle and photo expressions.

Use roster choices, manual options or the existing API choice-source configuration. Cards can show `{{row.name}}`, `{{row.number}}`, `{{row.position}}`, `{{row.label}}` and `{{row.photo}}`, plus mapped fields. Style the widget with the appearance inspector. Resize and place it like any other control.

Clicking a card or dropping it onto a compatible drop zone fills the selected ID and mapped variables atomically, then runs the stored action sequence. Drop zones also open a choice list for keyboard/touch use. A drop is accepted only for a valid choice in the same workspace.

Tabs write their selected value to the connected variable. Give the controls on each tab a visibility condition matching that value. Save the assembled controls as a panel component for reuse. Widgets are configurable card/drop/tab compositions, not an arbitrary HTML or JavaScript plugin system.

## Visual action flow and failure handling

Button sequences and macro editors show **Visual action flow**. Click a block to reach its settings; drag blocks to reorder the success path. IF/ELSE displays the two saved macro destinations. Use the normal condition editor to change their rules.

An individual action can specify **On confirmed failure → macro → stop**. Both success and failure paths undergo permission and cycle checks before execution. A confirmed failure runs the selected fallback, records the run as failed, and stops before later success-path actions. The execution history preserves the failed step and completed fallback steps.

Cancellation, expired access, ownership conflicts and unconfirmed output acknowledgements never invoke a fallback. Completed effects are never rolled back or replayed. Add failure handlers to individual actions within a macro, rather than to the macro-call/branch block itself. This editor uses connected ordered blocks and macro branches; arbitrary graph loops are intentionally unsupported.

## Hardware controls

Select a control in Build and expand **Hardware mapping**. Assign a function key, MIDI note/channel or gamepad button. Each input must have one mapping in the active panel. Hardware invokes the control's Click sequence through the same authenticated command service.

In **Operate → Hardware**, choose **Arm hardware**. Mappings work only while that panel is in Operate and the BroadcastCG window has focus. They are disarmed after changing panels, leaving Operate or reopening the application. Typing in an input field suppresses hardware actions. Held/repeated inputs do not build a command backlog.

- **Stream Deck:** configure its Hotkey action to send the assigned function key; F13–F24 avoid many normal keyboard shortcuts. This release does not install an Elgato plugin or update Stream Deck screen labels.
- **MIDI:** choose **Connect MIDI**. Note-on runs the mapped button. System-exclusive messages are not enabled. Optional note feedback sends velocity 0 for disabled, 32 for ready, and 127 for a matching Live condition. Device-specific color/palette protocols may require later adapters. An exact device name restricts a mapping; blank accepts any matching input/output.
- **Gamepad:** map a button index. Already-held buttons are ignored when arming or returning focus; release and press to trigger.

The function-key route is tested in the native app; MIDI parsing/feedback and mapping rules are covered by automated tests. Physical Stream Deck, MIDI and gamepad devices are not hardware-qualified in this release.

Implementation references: [Web MIDI](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API), [Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API), [Electron session permissions](https://www.electronjs.org/docs/latest/api/session).

## Output and deployment validation

Use the output diagnostics with your actual composition. The release qualification report records its scene, resolution, duration, decoded cadence and receiver queue drops. Effects, repeated layers and video decoding can change performance; 60 fps support is not a guarantee for every combination or receiver.

The installer is verified against its packaged application hash. A consistent database snapshot, prior application and previous installer are preserved before upgrading. QA uses disposable profiles, and deployment compares the real profile's accounts, projects, asset count and database integrity before and after installation.
