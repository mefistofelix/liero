# Bundled level sources

897 WebLiero catalog entries, copied without changing LEV bytes.

Source: https://gitlab.com/webliero/webliero-maps
Commit: b99412ece7d11911084dc97d785379132c9645be

The catalog records the source path and SHA-256 of every file. Identical files share one asset.
Map copyrights remain with their respective authors. The collection does not declare a blanket license; the engine license does not relicense these assets.

Original collection README follows:

# WebLiero Maps Repository

In this repository you can find user-made maps created for [Liero](https://liero.be/) / [WebLiero](https://www.webliero.com/).

The maps are put into separate subfolders (sorted by map authors).

## How to load maps

To load a map in the room:

- download map(s) to your HDD from relevant folder
- select "Change Map" option (in "Admin" options), then choose your map from HDD and press enter (note: to load a map, you need to be a host of the room or at least have admin rights)
- alternatively, if you run a room with custom headless-host room script, you can load maps from this repository directly by using your room script

## How to make a custom map

WebLiero supports two types of map files:

1. classic .lev format files (essentialy a fixed 504x350 size bitmap)
2. .png format files (a bitmap with no size restriction)

There are at least three known methods to make a custom map for WebLiero:

1. You can use original old Liero tools like e.g. WormHole2 (which you can download from [Liero Hell Hole website](https://liero.nl/)). However, in such programs you can make only .lev files;

2. You can use other, newer programs for that, e.g. [GIMP](https://www.gimp.org/). This method is recommended as the best and easiest one. For more information on how to make maps using GIMP, [see this cool tutorial made by pilaf](https://github.com/pilaf/liero-palettes);

3. You can draw your own WebLiero map on one of two Liero Builder rooms (both hosted by dsds); there's a custom [builder mod](https://gitlab.com/sylvodsds/builder-mod) there (with special "drawing tools" instead of regular weapons, like pencil, bricks, line marker, eraser etc.) and awesome [room script](https://github.com/s-dsds/builder-room), which allows you to modify your "picture" in almost any way you want (rotate, change size, change palette and material type etc.). All maps created in these rooms can be "saved", i.e. exported as a .png file directly to [this gallery](https://gitlab.com/sylvodsds/webliero-builder-maps).

## Palette and material types

WebLiero maps (both .lev and .png files) must be made using custom 8-bit (256c) palette in indexed mode. This means that the individual colour indices (from 0 to 255) have hardcoded behaviour in the game itself, i.e. those indices define the "material type" of every colour. The "material types" and their behaviours are:

| Material type   | worm collision | nr hook attach  | object collision | Destructible    | Colour indices |
|-----------------|:---------------|:---------------:|-----------------:|----------------:|---------------:|
| Rock            | ✔️            | ✔️              | ✔️              | ❌              | 19-29, 59-61, 85-87, 91-93, 123-125 |
| Background      | ❌            | ❌              | ❌              | ❌              | 130, 164-167   |
| See Shadow      | ❌            | ❌              | ❌              | ❌              | 160-163        |
| Worm            | ✔️            | ❌              | ❌              | ❌              | 30-38          |
| Undefined       | ✔️            | ❌              | ❌              | ❌              | 0, 3-11, 39-54, 62-76, 80-81, 104-119, 126-129, 131-159, 168-175, 181-255|
| Dirt            | ✔️            | ✔️              | ✔️              | ✔️              | 94-97 (green edge), 12-18, 55-58, 82-84, 88-90, 98-103, 120-122, 176-180 (brown edge)|
| Background Dirt | ❌            | ✔️              | ✔️              | ✔️              | 2 (green edge), 1, 77-79 (brown edge)|

_(note: Worm colours on maps behave like undefined, however they have special usage for worm sprites; see more info about this in WebLiero mod guide)_

_(note: colour 0 on maps behave like undefined, however it has got special usage for making sprites; see more information about this in WebLiero mod guide)_

_(note: dirt green edge acts actually the same as dirt brown edge; the only difference is that the anti-alias edges when digging dirt green edge have got different colour - 2 instead of 1)_

The assignment from the values to the colors (R/G/B) is done by the palette (which can be replaced with different colours), but the "material types" cannot be changed in any way, which means that you cannot change material type assigned to every colour (e.g. change material type in colour 19 form rock to dirt), or make more material types for each type (e.g. make more than 4 see shadow colours); however, such feature to modify material types is available in [WebLiero Extended hack](https://www.vgm-quiz.com/dev/webliero/extended).

Please also remember that the palette in WebLiero is a part of WLSPRT file, and this palette will be applied on every map when opening it in the game. This means that even if you make a map using your own custom palette (in which e.g. colour 164 is green), but load WLSPRT file with standard Liero 1.33 palette (in which colour 164 is brown) - then this colour on your map will be displayed in the game as brown.

For more information about material types and palette in WebLiero, [see this guide made by wgetch](https://liero.phazon.xyz/materials.html).
