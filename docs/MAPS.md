# Maps and provenance

The WebLiero v20 public bundle was checked on 2026-09-08:
https://www.webliero.com/v/20/game-min.js

Its level catalog contains 897 entries, with category bit flags (including
52 entries in All: Best). Catalog names, flags and source URLs are recorded in
`src/browser/maps/catalog.json`. No engine source from that bundle is included.
The upstream resource endpoint is
`https://api.webliero.com/__cache_static__/levels/<encoded-name>`.
Filenames are case sensitive on that endpoint.

All 897 catalog maps and precomputed PNG previews are bundled in src/browser/maps.
The browser fetches `/maps/catalog.json` as a static asset. Neither the client
bundle nor the Worker embeds the catalog; map files are served directly as assets.
The source collection is https://gitlab.com/webliero/webliero-maps. Every catalog
entry records its source path, SHA-256, local level and thumbnail URL. SOURCES.md
preserves attribution and the source revision. There are no runtime fetches to
WebLiero or another map service. The original user TEMPLE.LEV is also included.

Regenerate with `bun run assets:maps` using the local source clone. The task
validates every LEV, copies bytes unchanged, and generates previews from the
original palette (or the embedded Powerlevel palette). Downloading previews no
longer downloads full maps, and upstream rate limiting cannot break the library.

## Import and previews

LEV uses 504 × 350 palette indices. The importer accepts 176400 bytes through 1 MB, allowing legacy trailing metadata such as Vgen.lev, and checks for a complete POWERLEVEL palette
when that signature is present. The original Level::load reads the pixels and
optional palette. Previews use the same index/palette data. Physics comes from
original material indices; colors alone do not determine material in LEV files.

PNG, JPEG, WebP, GIF, BMP and AVIF use the browser's image decoder. Images fit into
504 × 350 with aspect ratio preserved, nearest-neighbor scaling and transparent
padding. Transparent pixels become index 0; opaque colors map to the nearest
original palette color. Animated formats use the first frame. Compression or
arbitrary artwork can change the resulting terrain classification, so the
converted preview is shown. These formats do not imply arbitrary world sizes,
Gusanos/LieroX formats, or automatic recovery of material metadata from photos.

Imported maps are content-addressed with SHA-256 and persist in IndexedDB.
Rotation order and enabled map IDs persist in localStorage. A selected source
that cannot be loaded produces an error rather than silently substituting
another level. Network guests receive the host's exact map bytes over WebRTC.
