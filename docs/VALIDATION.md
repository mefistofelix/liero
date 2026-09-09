# Local milestone validation — 2026-09-09

## Touch input

`bun test src/tests/engine.test.mjs src/tests/touch-input.test.ts
src/tests/mouse-input.test.ts`: 26 passing tests. Synthetic PointerEvent sequences
exercise the LocalGame event handlers: first-finger aiming, one-finger fire,
two-finger contextual rope/dig, three-finger release, no lower-count action when
lifting fingers, rapid rethrow, short taps, pending network input, compatibility
mouse suppression, cancellation, lost capture, menus, blur and free-camera drag.
The existing desktop mouse-chord and native engine fixtures still pass, including
JS/WASM keyboard parity. No native or network protocol changes were needed.

This validates event handling and engine input, not a physical multi-touch device.
Android/iOS gesture delivery and ergonomics still need testing on a phone. The
browser adapter cancels touch pointer defaults and keeps `touch-action: none`
scoped to the arena, following the
[Pointer Events compatibility-mouse rules](https://www.w3.org/TR/pointerevents3/#compatibility-mapping-with-mouse-events).

## Room presence in chat

Checked a private local room through two browser tabs: the host saw one system
message when a spectator joined and one when that member left through Local
play. Initial rosters stayed silent in both clients. Repeated room polls and
claiming a player seat did not add notices. The system messages use the existing
eight-line chat retention and fade path. The production bundle builds successfully.
These are live roster changes, not persisted chat history; unexpected disconnects
are reported when the room's existing membership timeout removes the member.

## Player-list spectating

Checked locally through the normal UI with two playing tabs and a third WebRTC
spectator. Clicking either player's name or another cell in their row follows
that worm and highlights only its row. The toolbar still cycles to free camera,
which clears the highlight. Spectator rows have no follow control; a playing
client has no follow controls in its player list. Tab and Enter select the next
player, with keyboard focus retained when room polling rebuilds the table.
The production bundle builds successfully. No native engine or protocol changes.

## Protocol 6

- `bun run engine`, `bun run engine:wasm` and `bun run test`: 67 passing tests.
- Complete snapshot save/restore, JS/WASM exchange, ropes anchored to worms,
  delayed/reordered/duplicate input, dropped progress, late spectators, confirmed
  state divergence recovery and one-shot Stop are tested with real engines.
- Automated WebRTC channel/queue checks use a fake RTCPeerConnection. Separate
  real multi-tab WebRTC gameplay checks are recorded below.
- `bun run netcode:audit` completes 2,100 host ticks with up to 400 ms synthetic
  RTT and no resync errors. It includes a continuous aim/fire/rope workload.
  See NETCODE.md for payload/CPU measurements and their scope.

### Published browser gameplay checks

Tested the public deployment of `93e7cd9` on 2026-09-09, using an isolated private
room, two playing tabs and a spectator in the same desktop browser. Inputs and
joins went through the normal interface. The invite was read from the visible
room-link field after Copy; the earlier report of an automation policy block was
incorrect: the clipboard read had returned an empty URL.

| Case | Observed result |
| --- | --- |
| Private invite / real WebRTC | Additional tabs joined the live match; displayed host RTT was typically 2–5 ms. |
| Shots between both players | Gauss Gun and Shotgun hits reduced the other worm's health, with matching bars in host, guest and spectator. One settled comparison showed 63 HP / 35 HP in all three. |
| Lethal shot / respawn | A host Gauss Gun shot killed the guest: host K=1/D=0, guest K=0/D=1, correct weapon in the feed, then guest health restored to 100 in all views. |
| Rope anchored to another worm | A guest right-click throw attached to the host worm; both were visibly pulled toward one another, with matching relative positions and connecting rope in the two player views. Space released the rope. |
| Digging | Four contextual right-clicks dug a visible opening into a dirt block. The following spectator displayed the same opening and worm position. Reloading that spectator preserved the opening and existing K/D. |
| Explosion / self-kill | A Chiquita Bomb fired into the opening removed a larger, distinctive crater. Both player views and the spectator agreed; guest D became 2 while host K stayed 1. |
| Fresh join after destruction | A new spectator tab, opened after the explosion, received the same crater, blood marks, player positions, host 63 HP / guest 100 HP and K/D 1/0 vs 0/2. Its free camera was used to inspect the crater. |
| Guest reload / re-entry | The guest rejoined as a spectator and could claim a seat again; reload did not retain an extra copy of that member. |
| Spectator host | After the host stopped playing, the other player could continue in the restarted solo round. |
| Console | No errors or warnings captured in the host, guest or final spectator during these checks. |

The combat/terrain fixture was imported through Maps as a normal 504 × 350 LEV:
background index 164, rock index 19 around the edges and below y=280, and a dirt
index 16 block at x=210..294, y=110..144. This made line-of-fire and terrain
changes easy to compare. Earlier checks also used Temple. Temporary maps were
removed from the rotation afterward, leaving Temple selected.

For a repeat: keep both player seats occupied throughout digging, shooting and
the late spectator join. A seat change or Play map now intentionally restarts
the round and therefore cannot validate transfer of its previously altered
terrain. Compare the same camera target, health/reload bars and K/D after the
join has finished; then use free camera to inspect the modified area.

This is real browser UI/WebRTC evidence, not a byte-by-byte browser memory check
or a WAN benchmark. Exact state equality, object references, anchored-rope
checkpoint restore and injected divergence recovery are covered separately by
the engine tests. Cross-device play, constrained bandwidth, packet loss and
different NATs still need real-network testing. Closing a tab without a delivered
quit can leave its member visible until the documented heartbeat expiry.

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
