# Sports and esports — phase 5

BroadcastCG 0.5.0 adds the **Sports** workspace. Configure a match, operate it there, or attach **Sports / esports action**, **Control clock** and **Bounded counter** actions to your own panel buttons and macros. Existing panel clock widgets, counter buttons and scoreboard +/− controls now use the desktop command service.

## Match profiles

| Profile | Included workflow |
| --- | --- |
| Football | Score +/−, half/extra-time selection, added minutes, formations, player selection, cards and substitutions. Configurable 45-minute period reference; the count-up clock does not automatically stop at 45:00. |
| Basketball | +1/+2/+3 and score corrections, configurable 10-minute countdown, independent 24-second shot clock with 14-second reset, quarters/overtime, fouls, timeouts-used counters and possession. |
| Volleyball | Rally scoring, best-of-five set history, 25-point sets and a 15-point fifth set, minimum two-point lead, series winner and reopening the last result for correction. |
| Esports | Configurable BO1/3/5/7 series and map pool, team pick/ban with undo, unplayed/unbanned map selection, side switching, round scoring, map results, series winner, timeout and player K/D/A. |

**New match setup** explicitly resets scores, clocks, player statistics, cards, draft and results. It keeps team names, rosters, panels and graphics. Setup requires both panel-edit and data-configuration permission; operating a configured match requires panel-operation permission. Viewer accounts can inspect it. The current roster is retained when changing sports, so adjust its active players for the new competition.

Period changes are manual and retain the existing clock. Set/reset the time before starting the next period. Break and Final pause all clocks. Completing a map or set pauses clocks, records the score, increments the winning side's series score and starts the next game at 0–0 unless the series is complete. Reopen last result restores the previous score for correction. No output is taken automatically.

These are operator tools, not a referee or a comprehensive game-rules engine. Overtime rules, foul penalties, time-out allowances, substitutions, discipline and game-specific esports scoring remain operator decisions. Team scores and individual player statistics are deliberately separate. Formation/pitch components remain football-specific; there is no 3D field, character draft engine or tournament bracket automation in this release.

Preset references: [IFAB Law 7](https://www.theifab.com/laws/latest/the-duration-of-the-match/) for football duration; [FIBA Official Basketball Rules 2024](https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2024-v10a.pdf), articles 8, 16 and 29, for the included basketball time/point presets; [FIVB Rules 2025–2028](https://www.fivb.com/wp-content/uploads/2025/01/FIVB-Volleyball_Rules2025_2028-EN.pdf), section 6, for set and match completion. Confirm the selected competition's regulations and configure its timings before use.

## Authoritative clocks

The local service owns clock state and uses monotonic elapsed time. Editor reload, switching tabs, logout and delays in a macro do not stop a running clock. Match, shot and timeout clocks are independent. Use Start/Pause, Reset, adjustments, or type seconds and press **Set … time**. Reset/set pauses the clock; adjustments preserve its running state. Countdowns clamp to zero. Clock values are published at whole-second resolution with fractional elapsed time retained internally.

Clock variables update the native output automatically after a graphic containing them has been taken. This is a data update; it never repeats TAKE, changes its command ID or restarts the scene animation. Scores and other data use **Update live graphic** when the operator is ready. The native output polls at 400 ms; this is not an official timing system, frame-locked output or hardware scoreboard synchronization.

Managed clock values are protected from stale whole-project saves. Data shows them read-only; use clock controls/actions to change them. Macros can read the latest values in conditions or templates while a clock runs. Generic Set/Increment/Counter and API variable bindings cannot write a managed clock. Exports include its current value; importing a project starts with stopped clocks rather than resuming timing.

Clock state is checkpointed every 250 ms during normal operation. Application restart always pauses it; unexpected shutdown shows **Interrupted** at the last durable checkpoint. Check the official clock before restarting. A stalled process or system suspend may delay a checkpoint, so recovery has no guaranteed maximum timing loss. Program starts off air. Duplicate command IDs cannot restart a paused clock or repeat a score change. A workspace supports up to 32 managed clocks, bounded to 24 hours.

## Rosters and graphics data

Select a player to fill `playerName`, `playerNumber`, `playerPhoto`, `playerPosition`, and `playerGoals`, `playerAssists`, `playerKills`, `playerDeaths`, `playerPoints`, `playerRebounds`, `playerFouls`. Reference these in graphic text/image fields with `{{variable}}`. Existing Data API bindings still fill team scores, names, photos and other supported values.

Roster data mapping accepts a local JSON array (up to 200 KB in the UI) or an array path from a saved HTTPS source. Source URL/credentials are configured in **Data**. Set the target team and map row paths for ID/name, number, position, photo, bench, slot and statistics. Optional fields can be left unmapped; bench then defaults to true, statistics to an empty object and shirt numbers/slots to row order. Map `stats` to an object such as `{ "kills": 12, "deaths": 3, "assists": 7 }` with numeric values. `bench` must be a Boolean when mapped. Photos must be HTTPS URLs (local media can be assigned in the roster editor).

Imports replace only the selected team's roster. They validate every row before making any change: IDs/names, supported types, photo URL, unique active slots and active-player limits (11 football, 5 basketball, 6 volleyball). Invalid data or a cancelled fetch leaves the roster intact. API fetches require data-fetch permission. Source credentials are retained in their existing protected local store, never in roster data or project exports.

**Apply substitution** in Sports updates the roster immediately, requiring an active outgoing player and an eligible bench player on the same team. The football panel retains its existing **stage substitution → TAKE** workflow. Inspect pending preview before using it; the two operations are distinct.

## Reliability and storage

Sports/clock/counter commands use phase 4 command IDs, permission checks, workspace ownership, expected revisions, durable step history and cancellation semantics. An accepted operation uses the current service value, not a stale displayed score. Stale or simultaneous conflicting submissions are rejected. No command is silently retried. Cancelling a sequence does not undo completed actions, including a clock already started; pause that clock explicitly. Match events show recent operations; Execution history and the administrator audit retain command outcomes.

Schema 4 adds `sports_clocks`. Upgrading a schema-3 database takes a consistent `before-sports-*.sqlite` backup before migration; upgrades from older schemas keep their earlier migration backup. Project documents retain format version 1 with optional sports/statistics fields. Do not downgrade an upgraded data folder.

All runtime operations remain local to one Windows workstation. PSD import, AE conversion, LAN operation and broadcast hardware qualification remain later phases.
