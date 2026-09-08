#!/usr/bin/env bash
# Run a nested GNOME Shell (devkit) with only this extension enabled, loaded from
# src/. Throwaway XDG_CONFIG_HOME and XDG_DATA_HOME keep the host session, its
# installed extensions and its home directory untouched.
set -eu

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export XDG_CONFIG_HOME="$(mktemp -d)/config"
mkdir -p "$XDG_CONFIG_HOME"

# Without a user-dirs.dirs in the throwaway config, GNOME falls back to $HOME and
# screenshots taken in the nested land in the host home. Redirect them to a temp dir.
NESTED_HOME="$(mktemp -d)/home"
mkdir -p "$NESTED_HOME"
for d in DESKTOP DOWNLOAD TEMPLATES PUBLICSHARE DOCUMENTS MUSIC PICTURES VIDEOS; do
  echo "XDG_${d}_DIR=\"$NESTED_HOME\"" >>"$XDG_CONFIG_HOME/user-dirs.dirs"
done
# Keep xdg-user-dirs-update from rewriting the file and recreating the host folders.
echo "enabled=False" >"$XDG_CONFIG_HOME/user-dirs.conf"

# Throwaway XDG_DATA_HOME pointing at src/, so the nested always runs the working
# tree and never an installed release. XDG_DATA_HOME wins over XDG_DATA_DIRS, which
# is left untouched so icon themes and the favorites' .desktop files stay reachable.
export XDG_DATA_HOME="$(mktemp -d)/data"
mkdir -p "$XDG_DATA_HOME/gnome-shell/extensions"
ln -sfn "$REPO_ROOT/src" "$XDG_DATA_HOME/gnome-shell/extensions/minibar@essembeh.org"

exec dbus-run-session -- bash -c "
  gsettings set org.gnome.shell enabled-extensions \"['minibar@essembeh.org']\"
  gsettings set org.gnome.desktop.input-sources sources \"[('xkb', 'fr')]\"
  gsettings set org.gnome.shell favorite-apps \"['firefox.desktop', 'org.gnome.Nautilus.desktop', 'org.gnome.Console.desktop', 'org.gnome.TextEditor.desktop', 'org.gnome.Extensions.desktop', 'org.gnome.Software.desktop']\"
  exec gnome-shell --devkit --wayland
"
