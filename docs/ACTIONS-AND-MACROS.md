# Actions, logic and macros — phase 4

BroadcastCG 0.4.0 executes desktop action buttons, reusable macros and transport output commands in the local service. The app stays offline unless a configured data feed or image needs a connection. This is the single-workstation command foundation for later LAN production.

## Create and run a macro

Open **Panels → Macros → New macro**. Name it and add actions. Use the arrow buttons to reorder them. A macro is saved with the project; editing it requires panel-edit permission. Run it directly in this dialog or assign **Run macro** to a button's action sequence in the panel inspector.

| Action | Configuration and result |
| --- | --- |
| Stage graphic | Choose a saved graphic. Capture its variables in Preview for a later TAKE. |
| Take to Program | Send the staged snapshot to native output and wait for acknowledgement. |
| Hide Program | Hide the current workspace's output. |
| Update live graphic | Send the current saved scene/variables without restarting its animation. |
| Set variable | Choose a variable and a value; its string, number or Boolean type is preserved. |
| Change number | Apply a signed numeric amount to the current saved value. |
| Wait | Wait 0–10000 milliseconds in the local service. Cancellation interrupts the wait. |
| Fetch API data | Fetch the configured HTTPS source and apply its saved bindings. If any binding is invalid, apply none of that response. |
| Run macro | Call another saved sequence. Recursion/cycles and oversized expansion are rejected. |

Values may contain `{{variable}}` substitutions. The service reads current saved variables before each step. Macros are limited to 100 actions each, eight nesting levels and 200 expanded steps per run. A project may contain 100 macros. Validation and permission checks happen before a run is accepted; values whose validity depends on earlier steps are checked during execution.

## Conditions

Each action has **Only if → Add condition**. Choose a Data variable, a comparison and a correctly typed value. Numbers support equals/not-equals and ordered comparisons; text and Boolean fields support equality. “Is set / true” and “Is empty / false” test truthiness. Combine up to 12 rules using **All (AND)** or **Any (OR)**.

The condition is evaluated when that step begins. A macro-call condition gates the whole called block once; changing its variable inside the block does not change the entry decision. Skipped steps appear in history. Existing text conditions (`variable` or `variable=value`) retain their previous meaning until replaced by the typed editor.

## Execution, ownership and cancellation

The editor saves before submitting a command with a unique ID and expected project revision. The local service records the accepted command in SQLite. Reusing the same ID and payload returns its recorded result, including after restart; changing the payload under an existing ID is rejected.

An accepted run owns its workspace until it finishes. Other runs and project writes are rejected during that interval. A sequence containing TAKE/Hide/Update reserves the local output for its duration. The status strip identifies the operator and workstation. Editing is temporarily locked, but **Execution history** remains available. The owning session or an administrator with panel-operation permission can use **Cancel sequence**. Permissions and session validity are checked again before pending steps and during waits; logout or revocation prevents remaining work.

Cancellation stops pending steps and aborts an in-progress API read. It does not undo completed data changes or retract an output command already sent. If output acknowledgement fails, the step and command remain **unconfirmed**, including when cancellation was also requested. Check the actual output before issuing a new command. A successfully acknowledged TAKE can remain on output after a subsequent failure or cancellation.

The ownership ID in the command state is a hook for future clients, not a LAN lease protocol. There is no configurable cross-PC Request/Take control workflow yet. This phase uses an automatic workspace execution lock and administrator cancellation; network arbitration is phase 8.

## Reconnect and recovery

**Execution history** shows the latest 50 runs, their owner, command ID, timestamps and individual step outcomes. Older command IDs remain in the database for replay protection. History never has a “retry failed steps” or automatic resume operation; a deliberate new Run creates a new command.

A renderer reload reconnects to an active command in the native service. Timed waits use monotonic elapsed time and continue while the editor reloads. The service reconciles the saved project back into the editor when the run ends. These committed updates are outside editor undo history; the editor history is cleared when adopting them so Undo cannot overwrite service changes.

Closing/restarting the application marks unfinished work **interrupted**. Pending steps do not resume. A step that was in flight is recorded as unconfirmed because its effect may have happened before shutdown. Completed changes remain saved. Program starts off air on a new application launch, and no TAKE is replayed.

Schema 3 adds the journal without changing the enclosing version-1 project format. Upgrading schema-2 data makes a consistent `before-commands-*.sqlite` backup in the local data folder before the transactional migration. Older application versions must not open the upgraded data folder.

## Current boundaries

- As of 0.5.0, desktop sports clocks run in the service and continue through editor reload. Use Control clock actions to change their values; conditions/templates read their current values. Application restart pauses clocks at the last checkpoint. Bounded counter and Sports / esports actions are also available. See [sports guide](SPORTS-AND-ESPORTS.md).
- Generic API actions use the existing HTTPS GET integration with configured credentials and saved data bindings. Custom HTTP methods, arbitrary scripts and shell execution are not supported.
- Preview/TAKE sequence steps preserve staged data. Use another Stage step before TAKE if you want changes made after the first Stage to appear in the snapshot.
- Project-scoped macros are shared resources. Copying/prefixing a panel component does not clone its referenced macros; edit or duplicate the macro manually for a separate workflow.
- Output acknowledgement proves the native renderer committed the update. It does not prove physical display scanout, SDI/NDI transmission or frame locking.

The release adds 17 automated logic/service tests, including duplicate IDs, restart interruption, stale revisions, permissions, ownership, cancellation, nested conditions, partial failure, API binding atomicity and output uncertainty. Native Electron QA creates a macro through the UI, sets a typed numeric condition, runs an acknowledged TAKE, reloads during a wait without duplicate execution and cancels another run.
