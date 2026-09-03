#!/usr/bin/env bash
# Send test notification(s) to exercise the badge.
# Run from INSIDE the nested session (e.g. a Console window opened in it).
#
# The GNOME notification daemon destroys a notification as soon as its D-Bus
# sender vanishes, so a one-shot `gdbus call` can never leave a lasting badge.
# This script therefore keeps the sender process alive: the notifications (and
# the badge) live until you Ctrl+C it — like a real application.
#
# Usage: ./tests/notify-test.sh [desktop-entry] [count]   (default: 3 notifs for Files)
set -eu

app="${1:-org.gnome.Nautilus}"
app="${app%.desktop}"
count="${2:-3}"

tmp=$(mktemp --suffix=.js)
trap 'rm -f "$tmp"' EXIT

cat > "$tmp" <<'EOF'
const {Gio, GLib} = imports.gi;

const app = ARGV[0];
const count = parseInt(ARGV[1]);
const connection = Gio.DBus.session;

for (let i = 1; i <= count; i++) {
    connection.call_sync(
        'org.freedesktop.Notifications',
        '/org/freedesktop/Notifications',
        'org.freedesktop.Notifications',
        'Notify',
        new GLib.Variant('(susssasa{sv}i)', [
            'notify-test', 0, 'dialog-information',
            `Test ${i}`, `badge test for ${app}`, [],
            {'desktop-entry': GLib.Variant.new_string(app)},
            0,
        ]),
        null, Gio.DBusCallFlags.NONE, -1, null);
}

print(`${count} notification(s) sent for ${app} — sender kept alive, Ctrl+C to end`);
new GLib.MainLoop(null, false).run();
EOF

if command -v gjs > /dev/null; then
    gjs "$tmp" "$app" "$count"
else
    nix-shell -p gjs --run "gjs '$tmp' '$app' '$count'"
fi
