# SPEC — Minimal taskbar for GNOME Shell

> Source of truth for the extension. Any behavior change must be reflected here.

**KISS principle**: every feature is implemented in its simplest robust form — smallest
code, no configuration knobs beyond §2.7, public Shell APIs only. If a requested
feature cannot stay small (heavy infrastructure à la aztaskbar: custom panels,
peek/preview machinery, per-monitor replication…), flag it and discuss the trade-off
BEFORE implementing.

## 1. Context & goals

- Replace **aztaskbar** (App Icons Taskbar, ~7,000 lines, oversized: intellihide,
  previews, multi-monitor, clock/weather…) with a **minimal, tailor-made** extension.
- Secondary goal: **learning** — write the extension end to end, custom architecture
  (no reparenting of the native Dash).
- Target: **GNOME Shell 49-50** — developed/tested on 50 (NixOS 26.05 stable), 49
  best-effort (floor set by `Clutter.ClickGesture`, a 49+ API). No compat shims for
  older versions.
- Studied references:
  - [App Icons Taskbar / aztaskbar](https://gitlab.com/AndrewZaech/aztaskbar) — local
    source: `/run/current-system/sw/share/gnome-shell/extensions/aztaskbar@aztaskbar.gitlab.com/`
  - [Tasks in Panel](https://github.com/fthx/tasks-in-panel) and
    [Dash in Panel](https://github.com/fthx/dash-in-panel) (fthx)

### Non-goals (explicitly out of scope, all versions)

- No labels/titles: **icons only**.
- No "peek" mode, no close/minimize buttons and no grid layout in the window previews
  (aztaskbar's heavy machinery), no intellihide, no multi-monitor (primary panel only),
  no Unity D-Bus badges (progress bars), no clock/weather, no publication on
  extensions.gnome.org (for now), no i18n.

## 2. Functional specification

### 2.1 Placement

- Icons are inserted into the **`_leftBox` of the native GNOME panel** (`Main.panel`),
  **to the right of the workspace indicator** (workspace-indicator extension), i.e. at
  the last position of the `_leftBox`.
- The native panel is never recreated; it can however be **relocated to the bottom**
  edge of the primary monitor via the `bar-position` setting (the `panelBox` is
  re-anchored after every `monitors-changed`/height change, and restored on disable).
  Popup menus flip automatically (BoxPointer).

### 2.2 Displayed apps

One **icon per application** (never per window), no label. Content, in order:

1. **Favorite apps** (`AppFavorites` order), **always visible** even when not running;
2. then **running non-favorite apps**, in a **stable** appearance order (an app does not
   move while it is running).

Rules:

- Favorite **and** running → a single icon (no duplicate), at its favorite position.
- `skip-taskbar` windows are ignored (dialogs, splash screens…).
- Windows from **all workspaces and all monitors** are counted by default; with the
  **workspace isolation** setting enabled, only windows from the active workspace are
  shown and counted.
- An app that closes disappears (unless favorite); a removed favorite disappears if it
  is not running.

### 2.3 Instance indicator (below the icon)

- **One dash per open window** of the app (aztaskbar MULTI_DASH style) → the indicator
  IS the instance counter. Dashes are thin with rounded (stadium) ends, drawn in a
  dedicated strip below the icon (never overlapping it), and shrink to always all fit
  in the button width, centered vertically in the strip (never glued to the bar edge).
  Their metrics scale with the bar size setting (normal: 5×3px in a 5px strip; large:
  7×4px in a 7px strip; extra-large: 8×5px in an 8px strip).
- Dash cap: **4 max** (like aztaskbar); beyond 4 windows, 4 dashes.
- The **focused app's button** also gets a subtle rounded background highlight
  (white at 30% opacity), consistent with the panel hover effect.
- Colors:
  - **focused** app: **GNOME accent color** (system accent);
  - running, non-focused app: **white**;
  - **non-running** favorite: no indicator.

### 2.4 Notification badge

- Like aztaskbar: a **badge** on the icon corner when the app has unread notifications
  in the MessageTray.
- Rendering: **numeric counter, iOS-style badge** — red round badge with the number of
  unread notifications, on the icon corner.
- Source: `MessageTray` monitoring (`source-added`/`source-removed`/
  `notification-added` signals, acknowledgement) — aztaskbar `notificationsMonitor.js`
  pattern.

### 2.5 Interactions

| Gesture                   | Behavior                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Left click**            | App not running → launch. Otherwise **focus, never minimize**: if one of the app windows has the focus **and is on the active workspace** → activate the **next** one in stable order (`stable_sequence`, so repeated clicks visit them all, across workspaces); otherwise → activate the app's most recently used window, **switching workspace** if it lives on another one. The workspace check on the focused window matters: after a workspace switch the focus may stay behind on the previous workspace, and taking `appears_focused` at face value then cycles instead of jumping to the app. |
| **Middle click**          | **New window/instance** (`Shell.App.open_new_window`).                                                                                                                                                                                                                                                                                                                                                            |
| **Right click**           | Native GNOME **AppMenu** (windows, .desktop actions, pin/unpin favorite, quit, details).                                                                                                                                                                                                                                                                                                                          |
| **Scroll on the top bar** | **Switch workspace** (can be disabled in settings): down = next, up = previous, **no wrap-around** at the first/last workspace. Applies to the whole panel (handler on `Main.panel`, so it also works over the icons); replaces the scroll-workspaces extension. Mouse wheel only (smooth touchpad scroll ignored for now). The native workspace switcher OSD (`WorkspaceSwitcherPopup`) is shown on each scroll. |
| **Hover**                 | After 600ms, a popup shows **one clickable thumbnail per window** (`Clutter.Clone`, ~220×130 max, window title above, KISS version of aztaskbar previews). Click a thumbnail → activate the window. The popup closes 300ms after the pointer leaves both the icon and the popup, and never opens over the right-click menu. No tooltip.                                                                           |

Left and middle clicks trigger a short scale-bounce animation on the icon as feedback.

### 2.6 Reactivity (events that update the bar)

- Window open/close (`window-created`, `unmanaging`), including `skip-taskbar` changes.
- Focus change (`notify::focus-window`) → recolor the indicators.
- Favorites list change (`AppFavorites::changed`) → reorder.
- Notifications added/read → badge.
- Session lock/unlock and `disable()` → clean teardown (GNOME rule: destroy everything
  in `disable()`).
- Settings changes apply live: `size` rebuilds all buttons, `isolate-workspaces`
  triggers a redisplay, `scroll-workspace` is checked at event time.

### 2.7 Settings (KISS)

GSettings schema `org.gnome.shell.extensions.minibar`, prefs window in libadwaita
with a destructive **Restore defaults** button row at the bottom (resets every key),
(one page, one group, three rows):

| Key                   | Type                                 | Default  | Effect                                                                                                                                                                                                                                                                                                          |
| --------------------- | ------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `size`                | `normal` \| `large` \| `extra-large` | `normal` | **Bar size**: top bar height (native ~34px / 40px / 46px) AND icon (24px / 28px / 32px), kept proportional. Non-normal sizes add the matching `minibar-panel-large` / `minibar-panel-extra-large` style class on `Main.panel` (not an inline style: the overview clears `Main.panel.style`), removed on disable |
| `spacing`             | `small` \| `normal` \| `large`       | `normal` | **Icon spacing**: drives box spacing AND button padding (CSS classes); resulting gap between icons ≈ 4px / 10px / 18px. Small keeps icons close but never touching                                                                                                                                              |
| `opacity`             | int `0`-`100`, 10% steps             | `100`    | **Bar opacity**: `100` keeps the native theme (no class); below, flat black via `minibar-opacity-N` classes in 10% steps, same not-inline-style pattern as `size`                                                                                                                                               |
| `bar-position`        | `top` \| `bottom`                    | `top`    | Anchor the whole GNOME panel to the top or bottom screen edge (primary monitor)                                                                                                                                                                                                                                 |
| `clock-position`      | `center` \| `right`                  | `center` | Clock (dateMenu) in the center box or at the left end of the right box; restored to its original box and index on disable                                                                                                                                                                                       |
| `isolate-workspaces`  | bool                                 | false    | Only show/count windows of the active workspace                                                                                                                                                                                                                                                                 |
| `notification-badges` | bool                                 | true     | Show the unread notification badge on icons (the MessageTray monitor stays connected either way — accepted trade-off for simplicity)                                                                                                                                                                            |
| `scroll-workspace`    | bool                                 | true     | Scroll on the top bar switches workspace                                                                                                                                                                                                                                                                        |

## 3. Technical specification

### 3.1 Constraints

- **Pure JS (GJS/ESM)**, zero build step, zero dependency.
- Public Shell APIs only, no monkey-patching.
- fthx philosophy: simple, signals via `connectObject()` (auto-disconnect), no feature
  instantiated when unused.
- Style: static `stylesheet.css` (dark-only assumed), sizes as JS constants.

### 3.2 Files

```
src/                       # everything the shell loads (install symlink / zip target)
  metadata.json            # uuid, shell-version: ["49", "50"], settings-schema
  extension.js             # Extension: enable()/disable(), panel insertion
  taskbar.js               # St.BoxLayout container: favorites+running merge, reconciliation
  appButton.js             # per-app button: St.Icon + indicators + badge + gestures
  notifications.js         # MessageTray monitor → Map appId→count
  windowPreview.js         # hover popup: one clickable Clutter.Clone per window
  prefs.js                 # Adw preferences window
  schemas/                 # gschema XML + compiled
  stylesheet.css
tests/nested.sh            # dev helper: nested devkit session
tests/notify-test.sh       # dev helper: notification badge test (run inside nested)
Justfile                   # task runner: check, pack, shexli, schemas, nested
.github/workflows/build.yml  # CI: checks on every push, release on a v* tag
docs/specs/taskbar.md      # this spec
```

- Name: **Minibar** — UUID: **`minibar@essembeh.org`**.
- Target order of magnitude: **500–800 lines** total.

### 3.3 GNOME Shell (49-50) APIs to use

| Need          | API                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| Favorites     | `AppFavorites.getAppFavorites()` + `changed` signal                                                               |
| Apps/windows  | `Shell.AppSystem.get_default()` (`app-state-changed`), `Shell.WindowTracker.get_default().get_window_app()`       |
| Windows       | `global.display` (`window-created`, `notify::focus-window`), `Meta.Window` (`unmanaging`, `notify::skip-taskbar`) |
| Widgets       | `St.BoxLayout` (`orientation` prop, not `vertical`), `St.Icon`, `St.Bin`, `St.DrawingArea` + Cairo for the dashes |
| Clicks        | **`Clutter.ClickGesture`** (`recognize` signal) — `Clutter.ClickAction` is dead in 49+                            |
| Panel         | `Main.panel._leftBox.insert_child_at_index()`                                                                     |
| Menu          | `AppMenu` (`resource:///org/gnome/shell/ui/appMenu.js`) + `PopupMenuManager`                                      |
| Notifications | `Main.messageTray` (`source-added`/`source-removed`, `notification-added`, `notify::acknowledged`)                |
| Signals       | `connectObject()` / `disconnectObject()` everywhere                                                               |
| Timers        | `GLib.idle_add_once` for batched redisplays; source id tracked, removed on destroy                                |

### 3.4 Reconciliation logic (core of the extension)

- A `Map<appId, AppButton>` cache; on each event, a `_redisplay()` (debounced via idle)
  recomputes the ordered list (favorites then stable running), creates/destroys/moves
  the `AppButton`s, updates indicators and badges. Pattern taken from aztaskbar's
  `appIconsTaskbar.js`.
- The stable order of non-favorites is kept in the Map (insertion order).

### 3.5 Accent color

- `global.stage.get_accent_color()` (St API, GNOME 47+) returns the accent color
  directly; hardcoded fallback to GNOME default blue if unavailable. The indicator is
  repainted on every focus change, which also picks up accent changes.

## 4. Dev workflow

- Install: **symlink** `~/.local/share/gnome-shell/extensions/<uuid>` → the repo;
  `gnome-extensions enable <uuid>`.
- Iterating on Wayland: nested session via `./tests/nested.sh`
  (`dbus-run-session -- gnome-shell --devkit --wayland` with an isolated dconf profile;
  `--nested` was removed in GNOME 49) to test without re-login; otherwise logout/login.
- Debug: `journalctl --user -f` (filter gnome-shell), Looking Glass (`lg`).
- Local barrier: `just check` — ESM syntax check, then shexli (the
  extensions.gnome.org static analyzer) on the built zip.
- CI (GitHub Actions): every push and PR runs the syntax check, builds the archive,
  asserts its layout/metadata/completeness and runs shexli; the upload and the
  GitHub release steps are gated on a `v*` tag, so a plain push publishes nothing.
- Nix packaging: **later**, out of scope for v1.

## 5. Maintenance risk map

Feature/LOC ratio and expected fragility across GNOME versions — the arbitration
guide when a release breaks something (KISS: a high-risk feature that breaks is a
candidate for removal, not for growing compat shims):

| Feature                          | ~LOC | Risk     | Fragile point                                                                                                                                                     |
| -------------------------------- | ---- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core (favorites+running, clicks) | 350  | low      | stable public APIs                                                                                                                                                |
| Dash indicators (Cairo)          | 50   | low      | self-contained                                                                                                                                                    |
| Workspace isolation              | 30   | low      | stable API                                                                                                                                                        |
| Settings/prefs                   | 110  | low      | Adwaita stable                                                                                                                                                    |
| Scroll + OSD                     | 45   | medium−  | `WorkspaceSwitcherPopup.display()` signature already changed once                                                                                                 |
| Notification badge               | 90   | medium   | MessageTray internals churn regularly                                                                                                                             |
| `ClickGesture`                   | 15   | medium   | API introduced in 49, still young                                                                                                                                 |
| Hover previews                   | 155  | medium   | grab/hover interactions via `PopupMenuManager`                                                                                                                    |
| Clock position                   | 15   | medium+  | moves private panel children (`statusArea.dateMenu`)                                                                                                              |
| Bar opacity                      | 25   | medium   | hardcodes the panel background color (was 100% theme-driven); panel corners (`PanelCorner`) match the theme's color, unverified against an override               |
| Bar position bottom              | 20   | **HIGH** | fights `LayoutManager._updateBoxes`; the shell assumes a top panel (hot corner, overview animations, OSD placement). First candidate for removal if it misbehaves |
