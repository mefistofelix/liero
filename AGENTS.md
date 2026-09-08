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
  the worm along the aim direction; otherwise throw the ninja rope. This is NOT
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
- Mouse menus: room explorer, room creation/settings, weapons, maps/rotation,
  profile, leaderboard, recordings and controls.
- Public/private rooms, private invite links, room chat. Show actual WebRTC RTT
  to the host for rooms and each member; show unavailable values as a dash.
- Two active players preserve the original engine; other room members spectate.
  Spectators can join mid-round, follow either player, or use free camera.
- Persist name, worm color, loadouts, room preferences and map rotation locally.
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
  room explorer/create, player count/list and audio. Dropdowns align to the right.
- Room explorer has three tabs: Explore (default), Create room and Local play. Creation settings
  belong only in the Create room panel, never below the server listing.
- Recordings has its own right-toolbar icon and works during live spectating.
  Audio is controlled only by the toolbar toggle. Neither belongs in Profile.
- Popup close/Escape returns to the previous menu when opened from that menu
  (e.g. Profile -> Weapons -> close -> Profile), retaining prior tab/form state.
- Opening settings or any popup NEVER pauses the simulation, including local play.
  Menus suppress gameplay input while open; the match and bot continue running.
- Profile Weapons chooses a personal five-slot loadout. Room Allowed weapons is
  a separate host-owned availability pool, applied to both loadouts and bonus drops
  through original Settings::weapTable. Validate at least one permitted weapon.
- Latest correction: room listings have ONE Players column showing total room
  members/capacity, e.g. 3/16, including spectators. Do not show the two-seat ratio.
  Player overlays and
  leaderboards show Kills and Deaths. Deaths count death callbacks, not lost lives.
- Player list starts open, includes spectators, measured host RTT, kills/deaths for players.
  Hiding it preserves the member count beside the toolbar icon.
- Chat opens on T or its top-left icon. The last eight messages stay visible at the
  bottom left without age-based expiry; older messages fade out briefly when newer
  ones push them beyond the eight-message limit. Input sits below the messages.
- Kill feed sits below the player list: killer, actual weapon, victim; entries fade.
  Observe original StatsRecorder callbacks. Do not infer weapons from current loadouts.
- Worm labels display the player name, with two thin bars below it for health and
  current-weapon reload progress, including while spectating. Use original engine
  health limits and reload timers. Your weapon name briefly replaces your name on change.
- Startup: choose the reachable public room with the lowest measured RTT worldwide;
  create a public room if none is reachable. There is NO region selector or region
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
