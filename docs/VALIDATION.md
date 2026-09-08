# Local milestone validation — 2026-09-09

- Bun 1.4.2 on Windows. `bun run dev` serves the game at port 3000.
- `bun run engine` and `bun run engine:wasm` build successfully through Bun tasks,
  using Emscripten 6.0.9, Python/Clang, CMake and Ninja. No PowerShell build wrapper.
- `bun run test`: 22 tests pass, including original keyboard JS/WASM fixtures,
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
  and Profile -> Weapons -> close returning to Profile.
- MP4 recording/archive was checked in this browser: an actual 1280×800 MP4 of
  approximately 93 seconds was saved and decoded by the browser video player.

These checks do not establish exhaustive 1:1 parity, internet NAT reliability,
or D1 deployment behavior. The app remains a local preview; no hosting deployment
has been performed. See stack.md and PORTING.md for implementation limits.
