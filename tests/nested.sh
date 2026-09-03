#!/usr/bin/env bash
# Run a nested GNOME Shell (devkit) with only this extension enabled.
# Uses a throwaway XDG_CONFIG_HOME so the real session settings are untouched.
set -eu

export XDG_CONFIG_HOME="$(mktemp -d)/config"
mkdir -p "$XDG_CONFIG_HOME"

exec dbus-run-session -- bash -c "
  gsettings set org.gnome.shell enabled-extensions \"['minibar@essembeh.org']\"
  gsettings set org.gnome.desktop.input-sources sources \"[('xkb', 'fr')]\"
  gsettings set org.gnome.shell favorite-apps \"['firefox.desktop', 'org.gnome.Nautilus.desktop', 'org.gnome.Console.desktop', 'org.gnome.TextEditor.desktop', 'org.gnome.Extensions.desktop', 'org.gnome.Software.desktop']\"
  exec gnome-shell --devkit --wayland
"
