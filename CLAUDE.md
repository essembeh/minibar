# CLAUDE.md — Minibar

Minibar (`minibar@essembeh.org`) is a **simple, opinionated taskbar** GNOME Shell
extension. GNOME **49-50** (developed/tested on 50, NixOS stable), pure GJS/ESM, no
build step. Shipped code lives in `src/`, dev helpers in `tests/`.

**`docs/specs/taskbar.md` is the source of truth.** Any behavior change must be
reflected there first (KISS principle and the maintenance risk map live at the top of
the spec). Repo content (code, docs, commits) is in English; conversation with Seb is
in French.

## Markdown formatting

All `.md` files (README, specs, this file):

- **Tables are padded so the pipes line up** — pad every cell with spaces to the
  widest cell of its column, and make the separator row match that width:

  ```markdown
  | Setting             | Values       | Default |
  | ------------------- | ------------ | ------- |
  | Bar position        | top · bottom | top     |
  | Workspace isolation | on · off     | off     |
  ```

  Count **characters, not bytes** (`·`, `—`, emojis are multi-byte). Check with
  `grep '^|' file.md | awk '{ print length($0) }' | sort -u` — a single value means
  the table is aligned.
- Wrap **prose** at ~88 columns (the existing files cap at 87-88). Tables, fenced
  code and long URLs are exempt — never break those to fit. Never reflow a paragraph
  that is not otherwise being edited.
- Fenced code blocks always carry a language tag (`bash`, `js`, `markdown`, `xml`).

## Feature requests: be critical (KISS guard)

When Seb asks for a new feature, do NOT just implement it:

1. **Assess the risk first**: complexity (LOC), reliance on private shell members or
   churn-prone GNOME APIs, fight against shell assumptions (see the risk map in the
   spec — e.g. `bar-position: bottom` is the standing example of 20 innocent-looking
   lines with a HIGH maintenance cost).
2. **If the feature carries such a risk, say so BEFORE implementing** and propose a
   compromise (smaller scope, different mechanism, or not doing it). Seb explicitly
   wants push-back, not compliance.
3. **Check the reference implementations first** — the feature very likely already
   exists there; read how they do it to anticipate problems (APIs, signals, edge
   cases, version shims):
   - [aztaskbar](https://gitlab.com/AndrewZaech/aztaskbar) — full source available
     locally: `/run/current-system/sw/share/gnome-shell/extensions/aztaskbar@aztaskbar.gitlab.com/`
   - [dash-to-dock](https://github.com/micheleg/dash-to-dock)
   - [tasks-in-panel](https://github.com/fthx/tasks-in-panel)

## Environment (NixOS)

- No dev tools in PATH (`node`, `glib-compile-schemas`, `gjs`… are all absent). Get
  them through `nix-shell -p <pkg> --run '<cmd>'` — **never** hardcode or hunt for
  `/nix/store/...` paths (they break on every GC / channel update):
  - syntax check (ESM, so read from stdin — `node --check file.js` parses as CJS and
    chokes on `import`):
    `nix-shell -p nodejs-slim --run 'for f in src/*.js; do node --input-type=module --check < $f || echo $f; done'`
  - after ANY gschema change:
    `nix-shell -p glib --run 'glib-compile-schemas src/schemas/'`
- `nix-shell -p` may fetch from the network into Seb's store: **ask him before the
  first use of a package** in a session.
- `tests/notify-test.sh` uses the same fallback for `gjs`.

## Dev workflow

- Iteration happens in a nested shell: `./tests/nested.sh` (GNOME devkit; `--nested`
  was removed in 49; dconf isolated via throwaway `XDG_CONFIG_HOME` — do NOT use
  `DCONF_PROFILE`, it hangs gnome-shell before any log).
- **Never launch `tests/nested.sh` yourself — ask Seb to run it** (two instances
  collide). To debug, ask him to pipe it: `./tests/nested.sh 2>&1 | tee <scratchpad>/nested.log`.
- Reload rules after a change:
  - extension JS → kill + relaunch the nested (ESM modules load once per process)
  - `stylesheet.css` → disable/enable the extension (Extensions app in the nested)
  - `prefs.js` → just reopen the prefs window (separate process)
  - gschema → recompile, then kill + relaunch
- Badge testing: `./tests/notify-test.sh` from a Console inside the nested. The
  notification daemon destroys a notification when its D-Bus sender exits, so the
  script keeps the sender alive (Ctrl+C ends the test). A banner being displayed sets
  `acknowledged` immediately.
- The install symlink points to `src/`:
  `~/.local/share/gnome-shell/extensions/minibar@essembeh.org` → `.../minibar/src`.
  It must point at `src/`, not at the repo root — otherwise the shell finds no
  `metadata.json`/`schemas/` and the extension stays in `ERROR`.

## GNOME 49/50 API gotchas (learned the hard way)

- `Clutter.ClickAction` is dead (49+): use `Clutter.ClickGesture` + `recognize`
  signal, button read via `gesture.get_button()` (0 = touch).
- `GLib.idle_add_once(priority, callback)` — the priority argument is REQUIRED;
  with one argument the callback silently never runs correctly.
- Clutter alignment (`x_align`/`y_align`) is only honored when the matching
  `x_expand`/`y_expand` is true (otherwise BinLayout centers the child).
- Accent color: `global.stage.get_accent_color()` (47+), values 0-255.
- `EventEmitter` (misc/signals.js) supports `connectObject` — usable for
  AppFavorites and our NotificationsMonitor.
- Popup shown on hover must NOT be added to a `PopupMenuManager`: its grab sends a
  phantom leave-event to the source actor (open/close loop).
