# Project Library — BroadcastCG 0.17

After signing in, BroadcastCG opens **Projects**. Existing saved projects appear automatically; their documents, IDs, revisions, assets and account grants are preserved. Click a card or **Continue last project** to enter the editor. Use **← Projects** in the top strip to return. Pending edits are saved first; a failed save keeps the editor open. Resolve a recovery draft or finish an active command/import before leaving.

## Create and organize

- **New project** starts with an empty scene and control panel, or the broadcast starter. Blank projects accept custom dimensions. Choose 24, 25, 30, 50 or 60 fps for the scene timeline. The starter uses its authored 1920 × 1080 dimensions.
- **Import project** uses the existing local package importer, including its dependency review. It creates a separate saved project.
- Search names, folder paths and tags. Use **All tags**, the sort menu, and **Grid/List** to find a project. Large results load 36 cards at a time; thumbnails are generated one at a time as cards approach the visible area.
- Star a project for **Favorites**. Favorites are private to the signed-in account. **Recent** sorts active projects by last saved modification; **Continue last project** follows the last project opened or saved.
- The folder **+** creates a virtual folder. Use paths such as `Client/Season/Event` for organization; these are labels, not directories moved on disk. **Folder & tags** in a card's menu moves it or changes comma-separated tags.
- Card menus offer **Rename**, **Duplicate**, **Change thumbnail**, **Export project**, and **Archive/Restore** according to account permissions. Duplicate creates independent project state and retains access to the same immutable local assets. Data-feed credentials are not copied.
- Archive hides a project from active lists without deleting it. Restore it under **Archived**. A project with an active live graphic must be hidden intentionally before archiving.

## Covers and local storage

**Change thumbnail** selects a scene and a time, or a PNG/JPEG/WebP image. Scene covers use the shared graphics renderer, including masks, groups and animation. They are small cached PNGs, refreshed after saved graphic changes. Video and external image URLs are omitted from automatic covers; choose an uploaded still for those projects. Custom covers stay fixed until changed.

Organization and thumbnail caches are stored beside the project documents in the local SQLite settings table. No project-schema migration is needed. Full workstation backups include them; portable project exports carry the graphics/assets but not workstation folders, favorites or cached covers.

The library does not start data feeds, TAKE graphics, clear output, or open network listeners. Switching projects within an application session preserves the current service/output snapshot. Application restarts retain the existing policy of starting off air. Frame-rate selection controls scene timeline sampling; physical output timing still depends on the configured adapter and hardware.

## Verification

`tests/project-library.test.mjs` covers document preservation, persisted organization and cover caching, concurrent-edit rejection, duplicate asset references, permissions, output preservation and new-project defaults. `desktop/library-smoke.mjs` exercises the desktop workflows, pending-save navigation, relaunch behavior, and practical desktop layouts as part of the normal isolated `--smoke-test` suite.
