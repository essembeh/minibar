import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {BatteryChargeLimit} from './battery.js';
import {NotificationsMonitor} from './notifications.js';
import {Taskbar} from './taskbar.js';

export default class TaskbarExtension extends Extension {
    enable() {
        const settings = this.getSettings();
        this._notificationsMonitor = new NotificationsMonitor();
        this._taskbar = new Taskbar(this._notificationsMonitor, settings);
        // Last position of the left box, i.e. right of the workspace indicator.
        Main.panel._leftBox.add_child(this._taskbar);
        this._batteryChargeLimit = new BatteryChargeLimit(settings);
    }

    disable() {
        this._batteryChargeLimit?.destroy();
        this._batteryChargeLimit = null;
        this._taskbar?.destroy();
        this._taskbar = null;
        this._notificationsMonitor?.destroy();
        this._notificationsMonitor = null;
    }
}
