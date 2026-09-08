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

The host coordinates deterministic input lockstep over reliable, ordered WebRTC
data channels with a six-tick input buffer. Both players run the same engine.
Every 70 ticks they compare a terrain/worm-state hash and stop on divergence.
Late spectators receive the seed, exact map bytes, round settings and bounded
input history, then catch up and follow live commits. Spectators cannot submit
player inputs. Rounds have a one-hour history bound. The host starts the next
rotation map five seconds after the round ends while both players remain.

This is not WebLiero's host-authoritative prediction/rollback implementation.
It has no rollback and higher latency may stall the simulation. Current replay
hashes cover terrain and major worm state, not every hidden object or RNG field.
Successful builds, cross-output fixtures and local WebRTC tests do not prove
complete parity with the original game or internet reliability.

## WebLiero reference

The public [v20 bundle](https://www.webliero.com/v/20/game-min.js) identifies
Haxe-to-JavaScript and WebRTC connections to a room host. Its About text describes
host authority and prediction. The wasm-flate helper decompresses zlib data;
it is not evidence of a WebAssembly simulation core. No WebLiero engine code
is shipped in this fork.

Native gameplay modes are retained. The screenshot's custom mod settings,
expanded maps, arbitrary-size worlds, teams and WebLiero's altered terrain
generator are not silently reproduced as original-engine features.
