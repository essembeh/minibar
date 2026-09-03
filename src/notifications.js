import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/**
 * Watches the MessageTray and keeps a per-app count of unread notifications.
 * Emits 'changed' whenever the counts may have changed.
 *
 * Pattern borrowed from aztaskbar/dash-to-dock notificationsMonitor.js.
 */
export class NotificationsMonitor extends EventEmitter {
    constructor() {
        super();
        this._counts = new Map();
        // Signals connected on tray sources/notifications, re-created on each refresh.
        this._trackedSignals = new Map();

        Main.messageTray.connectObject(
            'source-added', () => this._refresh(),
            'source-removed', () => this._refresh(),
            this);

        this._refresh();
    }

    countFor(appId) {
        return this._counts.get(appId) ?? 0;
    }

    _disconnectTracked() {
        this._trackedSignals.forEach((object, id) => object.disconnect(id));
        this._trackedSignals = new Map();
    }

    _refresh() {
        this._counts = new Map();
        this._disconnectTracked();

        for (const source of Main.messageTray.getSources()) {
            this._trackedSignals.set(
                source.connect('notification-added', () => this._refresh()),
                source);

            for (const notification of source.notifications) {
                const app = notification.source?.app ?? notification.source?._app;
                const appId = app?.id ?? app?._appId;
                if (!appId)
                    continue;

                if (notification.resident) {
                    if (notification.acknowledged)
                        continue;
                    this._trackedSignals.set(
                        notification.connect('notify::acknowledged', () => this._refresh()),
                        notification);
                }
                this._trackedSignals.set(
                    notification.connect('destroy', () => this._refresh()),
                    notification);

                this._counts.set(appId, (this._counts.get(appId) ?? 0) + 1);
            }
        }

        this.emit('changed');
    }

    destroy() {
        Main.messageTray.disconnectObject(this);
        this._disconnectTracked();
        this._counts = null;
    }
}
