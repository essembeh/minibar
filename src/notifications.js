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
        // Sources/notifications we listen to, re-created on each refresh.
        this._tracked = new Set();

        Main.messageTray.connectObject(
            'source-added', () => this._refresh(),
            'source-removed', () => this._refresh(),
            this);

        this._refresh();
    }

    countFor(appId) {
        return this._counts.get(appId) ?? 0;
    }

    // connectObject() over raw connect(): a refresh is triggered from the
    // 'destroy' handler of a notification, and disconnecting a handler by id on
    // an object that is going away throws. The signal tracker drops those
    // connections on its own, and the Set keeps the wrappers alive until then.
    _track(object, ...signals) {
        object.connectObject(...signals, this);
        this._tracked.add(object);
    }

    _disconnectTracked() {
        this._tracked.forEach(object => object.disconnectObject(this));
        this._tracked.clear();
    }

    _refresh() {
        this._counts = new Map();
        this._disconnectTracked();

        for (const source of Main.messageTray.getSources()) {
            this._track(source, 'notification-added', () => this._refresh());

            for (const notification of source.notifications) {
                const app = notification.source?.app ?? notification.source?._app;
                const appId = app?.id ?? app?._appId;
                if (!appId)
                    continue;

                if (notification.resident) {
                    if (notification.acknowledged)
                        continue;
                    this._track(notification,
                        'notify::acknowledged', () => this._refresh());
                }
                this._track(notification, 'destroy', () => this._refresh());

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
