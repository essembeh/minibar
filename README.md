# Minibar — a simple, opinionated taskbar for GNOME

**Strong opinions. Few settings. Small code.**
*The only bar in town with no tabs — opinions served neat, no chaser.*

A minimal taskbar extension for GNOME Shell: favorite and running apps as icons on
the left of the top bar — nothing more.

> ⚠️ **This extension implements *my* preferences.** It is intentionally light on
> configuration: I felt drowned by the settings pages of the (excellent) alternatives
> that inspired it — [App Icons Taskbar](https://extensions.gnome.org/extension/4944/app-icons-taskbar/)
> and [Tasks in Panel](https://extensions.gnome.org/extension/8642/tasks-in-panel/).
> If you want knobs for everything, use them; if you share my taste, enjoy.

## What it does

- **Icons only** (no labels): pinned favorites first (always visible), then running
  apps, one icon per app.
- **One dash per open window** below each icon (max 4) — accent color for the focused
  app, white for the others.
- **Notification badge** (iOS-style counter) on the icon corner.
- **Click**: launch / focus / cycle windows (never minimizes) · **middle click**: new window ·
  **right click**: native app menu · **hover**: window thumbnails.
- **Scroll on the bar**: switch workspace (no wrap-around), with the native OSD.

## What it deliberately does NOT do

Multi-monitor panels, intellihide, peek, preview grids, Unity badges, clock/weather
widgets, per-feature timing knobs… See the [spec](docs/specs/taskbar.md) — the KISS
principle at the top is the project's constitution, and the maintenance risk map in
§5 explains why small code beats features here.

## Settings (all six of them)

| Setting | Values |
| --- | --- |
| Bar position | top · bottom |
| Bar size | normal · large (bar and icons stay proportional) |
| Icon spacing | small · normal · large |
| Clock position | center · right |
| Workspace isolation | on · off |
| Scroll to change workspace | on · off |

## Compatibility

GNOME Shell **49 and 50** — developed and tested on 50 (whatever current NixOS
stable ships); 49 is supported on a best-effort basis (same APIs, untested).
No compatibility layers for older versions: the required `Clutter.ClickGesture`
API only exists since 49, and the extension moves forward with GNOME rather than
accumulating shims.

## Install

Minibar is not on extensions.gnome.org — install it from a release zip or from source.

### From a release zip

Grab `minibar@essembeh.org.shell-extension.zip` from the
[releases page](https://github.com/essembeh/minibar/releases)
(built by CI), then:

```bash
gnome-extensions install --force minibar@essembeh.org.shell-extension.zip
# log out / log in, then:
gnome-extensions enable minibar@essembeh.org
```

### From source

```bash
git clone https://github.com/essembeh/minibar
ln -s "$PWD/minibar/src" ~/.local/share/gnome-shell/extensions/minibar@essembeh.org
# log out / log in, then:
gnome-extensions enable minibar@essembeh.org
```

## Hacking

`./tests/nested.sh` starts a nested GNOME Shell (devkit) with only this extension
enabled and an isolated dconf — iterate without touching your session
(`./tests/notify-test.sh` exercises the notification badge from inside it). The
[spec](docs/specs/taskbar.md) is the source of truth: any behavior change must be
reflected there first.

## Suggestions welcome, with two filters

I am open to feature suggestions and PRs, as long as:

1. **I find the feature useful** — this is an opinionated extension, not a toolbox;
2. **it carries a low maintenance risk** across GNOME versions (see the risk map in
   the spec: anything fighting shell internals is a hard sell).

## License

GPL-3.0-or-later
