# Liero browser fork

## User requirements
- Fork `https://github.com/gliptic/liero`; its C++ sources are the gameplay reference.
- Preserve original gameplay 1:1: physics, collision, destructible terrain, weapons,
  ninja rope, RNG, integer arithmetic, simulation order and 70 Hz simulation.
- Rendering, audio, local input, remote input, lobby and transport are platform
  adapters. Do not approximate or redesign the simulation for convenience.
- Mouse aiming; left button fires; wheel changes weapon.
- Mouse buttons work together: fire remains active while holding right click,
  adjusting the rope or scrolling weapons. Middle click jumps/releases rope like
  Space; explicit release also wins while scrolling. Keyboard-only behavior stays original.
- Default movement is WASD, with key bindings editable in Settings, including
  both local keyboard profiles. W jumps normally and shortens the rope when
  attached; S means down/extend rope and MUST NOT dig. Space explicitly jumps
  or releases the rope. Digging remains on contextual right click.
- Right button is contextual: dig if diggable terrain is immediately in front of
  the worm along the aim direction; otherwise throw/rethrow the ninja rope immediately,
  replacing any existing rope on every fresh right click. This is NOT
  a short-click/long-press distinction. Preserve the distinction between dirt and rock.
- Automatic geographic matchmaking via Cloudflare D1, lobby and WebRTC gameplay.
  D1 stores matchmaking/signaling state, not per-frame game state.

## Primary implementation (confirmed by user)
Proceed with compiling the original C++ engine for the browser using Emscripten,
adding small platform and input adapters. JavaScript output is an option; a
WebAssembly build can be used to validate the same engine. Keep the source of the
physics intact apart from the explicitly requested mouse-input behavior.
The user restored this approach after discussing the manual JS alternative.

## Fallback if the primary approach fails
If compilation, compatibility, performance or gameplay fidelity cannot be made
adequate, try the user's second approach: a manual, LLM-authored port of the C++
codebase to maintainable modern JavaScript. Preserve the original `src` directory
and module structure, replacing C/C++ modules with corresponding JS modules.
Use an SDL compatibility layer preserving original function names and arguments,
mapping them to WebGPU/Canvas, WebAudio and browser input; add remote player input
through WebRTC. This fallback must not use Emscripten or generated engine code.
Document the concrete primary-path failure before switching. Do not switch merely
for stylistic preference or claim an approximate rewrite is a 1:1 port.

## Verification and reporting
Check numeric determinism and gameplay state using identical seeds and per-tick
inputs. Distinguish a successful build, tested gameplay parity and tested online
play. Never claim full 1:1 parity from compilation alone.
WebLiero's public bundle is a research reference, not an upstream source repository.
Its bundle identifies Haxe-to-JS, WebRTC host-authoritative netcode with prediction,
and a wasm-flate decompression helper. Preserve provenance and licenses.

## Workspace
- Repository root is the local gliptic/liero fork. Use ONLY `master`, locally and
  on GitHub. The user explicitly forbids separate feature branches or worktrees.
- `src/main.ts`: single local entrypoint. Run `bun run src/main.ts` or `./bun.exe run src/main.ts`.
- `src/browser/`: browser interface, engine assets, local and remote input.
- `src/server/`: D1-compatible matchmaking API and Bun SQLite adapter.
- User revised the initial no-manifest rule: `package.json` IS REQUIRED for Bun tasks.
  No application dependencies, package installation, tsconfig, bunfig, pnpm or Node.js runtime.
  Use Bun native APIs. `bun run dev` and direct `bun run src/main.ts` are equivalent.
  Build commands run through `src/tasks/main.ts`, never PowerShell wrappers.
  Emscripten needs its Python/Clang toolchain; CMake/Ninja are internal build tools.
  `src/tasks/build-engine.ts` normalizes discovery and environment overrides.
  Document actual toolchain limitations in `docs/stack.md`.
- Hosting is authorized later; test locally first. Do not publish an unfinished preview.
- Hosting publication is now requested after local validation. `bun run build` emits
  `dist/server/index.js`, `dist/client` and Sites D1 migration metadata. Production
  uses Cloudflare Workers + D1 and static assets; Bun/SQLite runs only locally.
- Default presentation is full-page gameplay with a single player viewport, compact
  corner toolbars without a header. Split screen is an option
  for two local players sharing a keyboard, not the default online/bot presentation.
- Public GitHub fork: https://github.com/mefistofelix/liero . Commit and push meaningful,
  verified milestones, not half-working intermediate experiments.
- `src/tasks/`: build/asset/test orchestration; `src/tests/`: automated verification.
- `.local/build/{js,wasm}`: compiler outputs, never committed.
- `.local/archive/`: old experiments, research clones and retired build folders.
- `.tools/`: local build tools; do not publish these.

## Browser product requirements
- All interface text is English. Conversation with the user can remain Italian.
- Full-page single camera by default; original split screen only for local two-player.
- Mouse menus: Room Browser, room creation/settings, weapons, maps/rotation,
  profile, leaderboard, recordings and controls.
- Public/private rooms, private invite links, room chat. Show actual WebRTC RTT
  to the host for rooms and each member; show unavailable values as a dash.
- Two active players preserve the original engine; other room members spectate.
  Spectators can join mid-round, follow either player, or use free camera.
- Persist name, worm color, loadouts, room preferences and map rotation locally.
  Generate a random color once on first launch. Closing Profile saves and applies name/color
  immediately in the current room and renderer without resetting simulation.
- Play toggles to Stop while playing. Stop and switching to spectator submit a synchronized suicide input
  and release the seat; pressing Play again re-enters.
- Weapon menu icons come from original game graphics. Map cards show terrain previews.
- Import LEV/Powerlevel and common browser image formats by dropping files in Maps.
  Preserve LEV pixels/palettes. Show the conversion result for other images.
- The root TEMPLE.LEV was supplied by the user; ship its copy under src/browser/maps.
  Bundle all 897 catalog maps and precomputed previews locally. NEVER fetch maps
  from third parties during play or preview. Sources: gitlab.com/webliero/webliero-maps.
  Catalog records source paths and content hashes; SOURCES.md retains provenance.
  Preserve original LEV bytes and custom Powerlevel palettes. Some files have trailing
  metadata; accept bounded files up to 1 MB rather than rejecting valid Vgen.lev.
- Favicon, install manifest and local recording archive with real MP4 downloads.
  Never rename another container to .mp4 when an encoder is unavailable.

## Current UX and multiplayer decisions
- English interface, using a font generated from original Liero bitmap glyphs.
- Left toolbar: ONLY chat. ALL other controls go in the right toolbar: spectate/camera,
  play, copy invite, fullscreen, profile dropdown, current-room settings dropdown,
  Room Browser/create, player count/list and audio. Dropdowns align to the right.
  Copy room link and Fullscreen are the final two buttons at the far right.
- Room Browser has three tabs: Explore (default), Create room and Local play. Creation settings
  belong only in the Create room panel, never below the server listing.
- Help has its own right-toolbar icon and is not part of Profile. Installation
  uses the browser UI; do not intercept the install prompt or add an Install button.
- Default loadout: Gauss Gun, Larpa, Chiquita Bomb, Spikeballs, Shotgun, in that order.
  Upgrade the former factory loadout while preserving customized choices.
- Recordings has its own right-toolbar icon and works during live spectating.
  Audio is controlled only by the toolbar toggle. Neither belongs in Profile.
- Popup close/Escape returns to the previous menu when opened from that menu
  (e.g. Profile -> Weapons -> close -> Profile), retaining prior tab/form state.
- Opening settings or any popup NEVER pauses the simulation, including local play.
  Menus suppress gameplay input while open; the match and bot continue running.
- Profile Weapons chooses a personal five-slot loadout. Room Allowed weapons is
  a separate host-owned availability pool, applied to both loadouts and bonus drops
  through original Settings::weapTable. Validate at least one permitted weapon.
  Preserve all five personal weapon slots; skip forbidden slots without replacing
  them. If none is permitted, firing is disabled until a weapon becomes available.
  Default room weapon loading time is 20%.
- Latest correction: room listings have ONE Players column showing total room
  members/capacity, e.g. 3/16, including spectators. Do not show the two-seat ratio.
  Player overlays use a table with Player, a compact icon-only Playing/Spectating status column, Kills, Deaths and Ping headers; rows
  contain values without repeating labels. Keep players ordered by kills descending and spectators at the bottom, with no second status line under names.
  Leaderboards show Kills and Deaths. Deaths count death callbacks, not lost lives.
- Player list starts open, includes spectators, measured host RTT, kills/deaths for players.
  Hiding it preserves the member count beside the toolbar icon.
- Chat opens on Enter or its top-left icon; Enter sends the composed message. The last eight messages stay visible at the
  bottom left without age-based expiry; older messages fade out briefly when newer
  ones push them beyond the eight-message limit. Input sits below the messages.
  Show outgoing messages immediately; relay persisted messages over WebRTC without
  waiting for D1 polling. Deduplicate echoes. Beep for new messages, including own
  messages, respecting the audio toggle; do not beep for historical messages.
- Kill feed sits below the player list: killer, actual weapon, victim; entries fade.
  Include suicides with no killer name. Keep these entries through round transitions.
  Observe original StatsRecorder callbacks. Do not infer weapons from current loadouts.
- Worm labels display the player name, with two thin bars below it for health and
  current-weapon reload progress, including while spectating. Use original engine
  health limits and reload timers. Keep the player name on weapon changes, and briefly show the local player weapon name above it. Hide the
  original kill/suicide banners and weapon-switch text; use the browser overlays.
- Startup: open Room Browser directly on Explore while loading Temple. No welcome popup. Joining or
  creating a room and explicit Play actions close the popup. Invite links join directly.
  Find nearest room chooses the lowest measured RTT worldwide and creates a public
  room if none is reachable. Temple is the default rotation; preserve custom pools.
  There is NO region selector or region
  requirement. Explorer defaults to people descending, then ping ascending; columns
  are sortable and Show empty/Show full filters toggle inclusion. Flags are informative.
- Room and player flags use bundled SVG files. Obtain country from request.cf or
  cf-ipcountry; Sites fallback is the browser’s same-origin /cdn-cgi/trace loc field.
  Preserve unknown geography as unknown; do not guess a country.
- Maps has a right-toolbar button. Header/close, import, search, filters and top
  pagination remain fixed; only map cards and rotation scroll. Hosts can Play now
  to restart everyone on a selected map, including while playing alone.
- The hosted game is PUBLIC at https://liero.haxthepax.chatgpt.site/ and is named Liero.
- Every room entry, INCLUDING creation, starts as spectator. Host is an independent
  ownership role; either/both player seats may belong to guests. A Play action claims
  an available seat. One ready player starts immediately and can play while waiting.
  Solo waiting defers match completion and hides the unoccupied worm through the
  browser adapter. The second player can join immediately; seat changes restart a
  synchronized round on the same map with original multiplayer rules.
- Spectate while playing requires a GUI confirmation and releases the slot.
  Any remaining player continues in a new solo round. Spectator clicks cycle players, then free camera.
  Drag right mouse to pan free camera; configured WASD also works during live spectating.
- Host owns room rules/rotation. Guests inspect room rules and edit their own profile/loadout.
  Rule changes apply on a synchronized simulation tick and are retained in spectator
  history. In-progress reloads preserve their completion fraction at the new speed.
  Keep initial round rules in the join setup; replay timed changes from history.
- WebRTC reliable ordered lockstep at 70 Hz, six ticks of input buffering. D1 handles
  directory, membership, chat and SDP/ICE only. It never carries per-frame simulation.
- Spectator host coordinates inputs from both remote seats. Late viewers receive
  exact map bytes + bounded input history. No prediction, rollback, TURN service,
  headless host or host migration is currently implemented. Report these limits honestly.

## Repository organization
All new application source, task scripts and tests live under src. Original native
TC assets, pkg and CMake metadata remain at their upstream paths to preserve the
reference engine build. Root contains package.json, Bun binary (ignored), README,
AGENTS and original native metadata; do not add new competing app scaffolds.
`docs/stack.md` is the runtime/build reference; `docs/PORTING.md` records parity limits.

## Presence and loadout updates
- Send an authenticated keepalive quit on pagehide. Recover unfinished quits from the
  previous page on navigation, without removing a separately opened tab (Web Locks).
  Use a fresh identity for every room entry. D1 departure records reject delayed joins;
  scope poll and peer callbacks to the entry epoch. Rejoining the same room is a no-op.
  Unexpected crashes/offline quits still rely on the 120-second membership expiry.
- Named loadout presets are saved separately for each local player. Selecting, editing
  or dragging slots applies immediately; the compact weapon list also supports dragging weapons into slots.
  The Weapons menu uses the profile that opened it, with one named Loadout selector; Alt+Left/Right also reorders slots. Online
  changes are host-committed with frame history (protocol 4). Retain ammunition and
  reload progress of kept weapons; newly added weapons start their normal reload.
- Split screen shows a second profile toolbar button; player 1 remains the online
  profile. Close Profile to save and apply, without a Save button or live typing updates.
- Play spawns immediately without a fire confirmation; subsequent respawns are automatic
  after the original delay. Preserve native behavior unless the browser adapter opts in.
- Held W must not detach a rope in flight; it shortens once attached. Space/middle
  still explicitly release it. Help sits immediately before the sound button.
- Derive PWA and Apple icons from the bundled favicon with the Bun assets:icons task.

- Maps offers Select all / Deselect all across the entire library, regardless of page or filter.
  Empty selection is a local draft; keep the last valid room rotation until a map is selected.
  Cancelling the native file picker must leave the Maps dialog open.
- Asynchronous button/form actions keep text/icons at full opacity, append a spinner at the end (replace the icon for icon-only buttons), and disable the trigger
  until settlement, preventing repeated submissions. Restore it after success/error;
  retain disabled conditions updated by room state while an action was pending.

- Instant Play must call the original beginRespawn algorithm before making the worm
  visible; initial worms have a 150-tick countdown and uninitialized (0,0) position.
  Do not reset/save room rules before each round. Start the prepared simulation before
  awaiting its directory phase update; notify the host immediately of seat changes.
