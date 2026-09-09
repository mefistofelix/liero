# Browser port

Reference: [gliptic/liero](https://github.com/gliptic/liero), upstream commit
`a2ed03cbbabc4fd0af0ed6f1e4f37aa4b69e45fa`.

The user-confirmed primary approach compiles the original C++ engine with
Emscripten to JavaScript (`WASM=0`). This is generated JavaScript, not a
handwritten source translation. The manual JS/SDL-shim fallback is in AGENTS.md.

## Boundaries

- `src/game/`: upstream simulation, resources and pixel renderer.
- `src/web/bridge.cpp`: deterministic initialization, absolute aim, input mapping,
  camera presentation, original weapon artwork and browser audio capture.
- `src/web/netstate.hpp`: complete pointer-free online save/restore and canonical
  state hashing; original simulation sources are unchanged by this netcode revision.
- `src/browser/`: native DOM menus, Canvas presentation, fixed 70 Hz scheduling,
  WebRTC input transport, storage, level import and recording.
- `src/server/`: D1-compatible regional rooms, membership, signaling and chat;
  native Bun SQLite supplies the same transactional batch contract locally.
- `src/main.ts`: one Bun HTTP entrypoint with an in-memory browser build.

The gameplay-source change is `Worm::externalAim`, default false, preventing
movement from reversing mouse aim. Physics, weapon definitions, terrain
destruction, rope forces, integer arithmetic and random tables remain upstream.
Mouse aim is an intentional control change. The legacy replay file format does
not encode absolute aim, so legacy replay recording is disabled in this adapter.

Right click chooses dig or rope on the press edge. Holding a digging click
repeats original dig edges and does not throw a rope on exiting dirt. Rock is not
dirt. W maps to original Jump unless attached to a rope, then Change + Up; S maps
only to Change + Down while attached. S never digs. Space explicitly releases
the rope. Wheel suppresses simultaneous Jump to avoid an unintended rope throw.

Single view and free camera reframe a copy of the original viewport. Simulation
viewports and their random camera-shake processing remain unchanged. Split
screen still calls the original Game::draw. Single view uses the original
Viewport::draw and palette animation, with a DOM HUD.

## Browser platform

Canvas 2D displays the original pixel buffer without interpolation. WebGPU could
replace presentation independently. Original SDL audio reaches WebAudio through
the compiled platform layer; a separate MediaStream destination captures game
audio for recordings, without microphone or screen-capture permissions.

The virtual filesystem is case insensitive, as expected by original assets:
tc.cfg requests shotgun.wav while upstream ships SHOTGUN.wav.

## Network protocol

D1 stores room discovery, membership, configuration, chat and expiring SDP/ICE
signals. It does not store simulation frames. Private room invitations are random
capabilities, hashed in the database, carried in URL fragments and sent only in
the room API header. Public listings omit invitation capabilities.

Protocol 6 follows the observed WebLiero architecture: the host assigns ticks and
sequence numbers to compact input changes and advances without waiting for every
guest. All peers run the same native engine at 70 Hz. Clients retain a confirmed
baseline and predict up to 14 ticks ahead, then restore/replay that bounded world
when confirmed progress or corrected action timing arrives. Two ticks of input
delay reduce correction work. The rope and its anchor are restored together.

Three negotiated WebRTC channels separate reliable ordered control/checkpoints,
reliable unordered actions and unreliable unordered progress. Progress is 10 Hz;
every 70 ticks a hash covers the complete serialized canonical world. Divergence
requests a new checkpoint with retry limits. Spectators cannot submit player inputs.
Late viewers receive compressed original map bytes plus the current world and
pending actions, not an entire round's history. Rounds retain a one-hour duration
limit. Host succession still restarts the level, rather than migrating its exact frame.

The adapter silences speculative audio and exposes only confirmed kill/death
telemetry, avoiding repeated effects during replay. Local physics, RNG, weapon
definitions and the native tick order are unchanged. The native replay serializer
and postClone are not used as complete snapshots. Tests include identical ongoing
simulation after JS/WASM checkpoint exchange and a rope anchored to the other worm.
These fixtures do not establish exhaustive parity or internet reliability. See
[NETCODE.md](NETCODE.md) for measured results, real browser checks and their limits.

## WebLiero reference

The public [v20 bundle](https://www.webliero.com/v/20/game-min.js) identifies
Haxe-to-JavaScript and WebRTC connections to a room host. Its About text describes
host authority and prediction. The wasm-flate helper decompresses zlib data;
it is not evidence of a WebAssembly simulation core. No WebLiero engine code
is shipped in this fork.

Native gameplay modes are retained. The screenshot's custom mod settings,
expanded maps, arbitrary-size worlds, teams and WebLiero's altered terrain
generator are not silently reproduced as original-engine features.

### CSLiero Rewormed feasibility (2026-09-09)

Reviewed Kami's CS Rewormed **0.37**, from the public
[WebLiero mods repository](https://gitlab.com/webliero/webliero-mods/-/tree/206c9754781444ff2101ae8ce9ecf8a97e39d31a/kami/cs_rewormed).
The pack was not integrated. The user prefers keeping additional weapons as
external data with minimal native changes, and explicitly permits skipping this
feature when it would complicate the original engine.

This is not just a different file format: the SHOCKGRENADE projectile uses
`hitDamage: 0.1`, `bounceFriction: 0.4` and `repeat: 2`. Native `Weapon` stores
integer damage and has no equivalent `bounceFriction` or `repeat` fields.
Rounding or dropping these properties would change the mod's behavior.
Supporting the complete pack faithfully therefore needs simulation work, not
only JSON5 conversion. The native settings and browser adapters also assume
40 weapons, and the pack's sprite/palette references need a separate asset
conversion and remapping path to coexist with the classic assets.

The original 40 weapons, their IDs, assets and physics remain unchanged. No
CS Rewormed assets or executable mod code are shipped. Reconsider only as a
separate, explicitly authorized compatibility project with deterministic tests.
