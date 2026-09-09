# Local milestone validation — 2026-09-09

## Protocol 6

- `bun run engine`, `bun run engine:wasm` and `bun run test`: 67 passing tests.
- Complete snapshot save/restore, JS/WASM exchange, ropes anchored to worms,
  delayed/reordered/duplicate input, dropped progress, late spectators, confirmed
  state divergence recovery and one-shot Stop are tested with real engines.
- WebRTC channel/queue checks use a fake RTCPeerConnection; they do not establish
  a real protocol-6 browser handshake. One local browser started and played a room
  without console errors. The automation URL policy blocked opening the private
  invite in another tab; multi-tab testing remains incomplete.
- `bun run netcode:audit` completes 2,100 host ticks with up to 400 ms synthetic
  RTT and no resync errors. It includes a continuous aim/fire/rope workload.
  See NETCODE.md for payload/CPU measurements and their scope.

## Earlier milestones (previous network protocol)

- Bun 1.4.2 on Windows. `bun run dev` serves the game at port 3000.
- `bun run engine` and `bun run engine:wasm` build successfully through Bun tasks,
  using Emscripten 6.0.9, Python/Clang, CMake and Ninja. No PowerShell build wrapper.
- `bun run test`: 28 tests pass, including original keyboard JS/WASM fixtures,
  deterministic rendering/cameras, contextual W/S and rope release, weapon pools,
  original lethal-weapon telemetry, room permissions and concurrent seat claims.
- All 897 map entries have local LEV assets and PNG previews. Tests verify each
  level's SHA-256 against the catalog and validate dimensions of every preview.
  The map, icon and original-font generation tasks have been run successfully.
- Browser checks: automatic public-room spectator entry, measured local RTT,
  public/private creation, live WebRTC with a spectator host and two remote
  players, late spectators, chat, and confirmation when releasing a player seat.
- Browser UI checks: chat-only left toolbar, remaining controls on the right,
  full link icon, separate explorer tabs, original-font menus, local thumbnails,
  and Profile -> Weapons -> close returning to Profile. Player names have health
  and reload bars below them; their per-player telemetry is also tested independently
  of the selected camera, without changing simulation state.
- MP4 recording/archive was checked in this browser: an actual 1280×800 MP4 of
  approximately 93 seconds was saved and decoded by the browser video player.

These checks do not establish exhaustive 1:1 parity, internet NAT reliability,
or every D1 deployment behavior. The first hosted release was deployed successfully
through Sites with a Cloudflare Worker, D1 migrations and all static assets.
See stack.md and PORTING.md for implementation limits.
