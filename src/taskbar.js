import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {WorkspaceSwitcherPopup} from 'resource:///org/gnome/shell/ui/workspaceSwitcherPopup.js';

import {AppButton, getAppWindows} from './appButton.js';

const SPACING_VALUES = ['small', 'normal', 'large'];
// Style class (see stylesheet.css) rather than an inline style: the overview
// resets Main.panel.style to null when it finishes hiding, which would drop it.
// Panel style class per 'size' setting ('normal' keeps the native panel height).
const PANEL_SIZE_CLASSES = {
    'large': 'minibar-panel-large',
    'extra-large': 'minibar-panel-extra-large',
};

/**
 * Container holding one AppButton per app: favorites first (AppFavorites
 * order, always visible), then running non-favorite apps in stable
 * appearance order. All workspaces, all monitors.
 */
export const Taskbar = GObject.registerClass(
class Taskbar extends St.BoxLayout {
    _init(notificationsMonitor, settings) {
        super._init({style_class: 'taskbar'});
        this._notificationsMonitor = notificationsMonitor;
        this._settings = settings;
        // appId → AppButton, kept in display order for non-favorite stability.
        this._buttons = new Map();
        this._menuManager = new PopupMenu.PopupMenuManager(this);
        this._redisplayQueued = false;
        this._destroyed = false;

        AppFavorites.getAppFavorites().connectObject(
            'changed', () => this._queueRedisplay(), this);
        Shell.AppSystem.get_default().connectObject(
            'app-state-changed', () => this._queueRedisplay(), this);
        Shell.WindowTracker.get_default().connectObject(
            'notify::focus-app', () => this._updateButtons(), this);
        global.display.connectObject(
            'window-created', (_display, window) => this._onWindowCreated(window), this);
        this._notificationsMonitor.connectObject(
            'changed', () => this._updateButtons(), this);
        Main.panel.connectObject(
            'scroll-event', (_panel, event) => this._onPanelScroll(event), this);
        global.workspace_manager.connectObject('active-workspace-changed', () => {
            if (this._settings.get_boolean('isolate-workspaces'))
                this._queueRedisplay();
        }, this);
        this._settings.connectObject(
            'changed::size', () => this._rebuildAll(),
            'changed::spacing', () => this._updateSpacing(),
            'changed::isolate-workspaces', () => this._queueRedisplay(),
            'changed::notification-badges', () => this._updateButtons(),
            'changed::bar-position', () => this._updateBarPosition(),
            'changed::clock-position', () => this._updateClockPosition(),
            this);
        // Re-anchor the panel after the layout manager resets it to the top.
        Main.layoutManager.connectObject(
            'monitors-changed', () => this._updateBarPosition(), this);
        Main.layoutManager.panelBox.connectObject(
            'notify::height', () => this._updateBarPosition(), this);
        this._updateSpacing();
        this._updatePanelHeight();
        this._updateBarPosition();
        this._updateClockPosition();
        this.connect('destroy', () => this._onDestroy());

        // Watch workspace moves of pre-existing windows (isolation filtering).
        for (const app of Shell.AppSystem.get_default().get_running()) {
            for (const window of app.get_windows())
                this._watchWindow(window);
        }

        this._queueRedisplay();
    }

    _updateSpacing() {
        let value = this._settings.get_string('spacing');
        if (!SPACING_VALUES.includes(value))
            value = 'normal';
        // Each value drives both the box spacing and the button padding (CSS).
        for (const v of SPACING_VALUES)
            this.remove_style_class_name(`taskbar-spacing-${v}`);
        this.add_style_class_name(`taskbar-spacing-${value}`);
    }

    _updateBarPosition() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;
        const panelBox = Main.layoutManager.panelBox;
        if (this._settings.get_string('bar-position') === 'bottom')
            panelBox.set_position(monitor.x, monitor.y + monitor.height - panelBox.height);
        else
            panelBox.set_position(monitor.x, monitor.y);
    }

    _updateClockPosition() {
        const container = Main.panel.statusArea.dateMenu.container;
        container.get_parent()?.remove_child(container);
        if (this._settings.get_string('clock-position') === 'right')
            Main.panel._rightBox.insert_child_at_index(container, 0);
        else
            Main.panel._centerBox.insert_child_at_index(container, 0);
    }

    _updatePanelHeight() {
        const wanted = PANEL_SIZE_CLASSES[this._settings.get_string('size')];
        for (const cls of Object.values(PANEL_SIZE_CLASSES)) {
            if (cls === wanted)
                Main.panel.add_style_class_name(cls);
            else
                Main.panel.remove_style_class_name(cls);
        }
    }

    _rebuildAll() {
        this._updatePanelHeight();
        this._buttons.forEach(button => button.destroy());
        this._buttons.clear();
        this._queueRedisplay();
    }

    _watchWindow(window) {
        window.connectObject(
            'notify::skip-taskbar', () => this._queueRedisplay(),
            'workspace-changed', () => {
                if (this._settings.get_boolean('isolate-workspaces'))
                    this._queueRedisplay();
            },
            this);
    }

    _onPanelScroll(event) {
        if (!this._settings.get_boolean('scroll-workspace'))
            return Clutter.EVENT_PROPAGATE;
        let diff;
        switch (event.get_scroll_direction()) {
        case Clutter.ScrollDirection.DOWN:
            diff = 1;
            break;
        case Clutter.ScrollDirection.UP:
            diff = -1;
            break;
        default:
            return Clutter.EVENT_PROPAGATE;
        }

        const workspaceManager = global.workspace_manager;
        const index = workspaceManager.get_active_workspace_index() + diff;
        // No wrap-around at the first/last workspace.
        if (index >= 0 && index < workspaceManager.get_n_workspaces())
            workspaceManager.get_workspace_by_index(index).activate(event.get_time());
        this._showWorkspaceSwitcherPopup();
        return Clutter.EVENT_STOP;
    }

    _showWorkspaceSwitcherPopup() {
        if (Main.overview.visible)
            return;
        if (!this._workspaceSwitcherPopup) {
            this._workspaceSwitcherPopup = new WorkspaceSwitcherPopup();
            this._workspaceSwitcherPopup.connect('destroy',
                () => (this._workspaceSwitcherPopup = null));
        }
        this._workspaceSwitcherPopup.display(
            global.workspace_manager.get_active_workspace_index());
    }

    _onWindowCreated(window) {
        // 'windows-changed' on Shell.App covers open/close, but not a window
        // toggling its skip-taskbar flag or moving to another workspace.
        this._watchWindow(window);
    }

    _updateButtons() {
        this._buttons.forEach(button => button.update());
    }

    _queueRedisplay() {
        if (this._redisplayQueued)
            return;
        this._redisplayQueued = true;
        GLib.idle_add_once(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._redisplayQueued = false;
            if (!this._destroyed)
                this._redisplay();
        });
    }

    _hasInterestingWindows(app) {
        return getAppWindows(app, this._settings).length > 0;
    }

    _redisplay() {
        const favorites = AppFavorites.getAppFavorites().getFavorites();
        const favoriteIds = new Set(favorites.map(app => app.get_id()));
        const running = Shell.AppSystem.get_default().get_running()
            .filter(app => this._hasInterestingWindows(app));
        const runningIds = new Set(running.map(app => app.get_id()));

        // Favorites first, then already-displayed running apps (stable order),
        // then newly running apps appended at the end.
        const desired = [...favorites];
        const desiredIds = new Set(favoriteIds);
        for (const [id, button] of this._buttons) {
            if (!desiredIds.has(id) && runningIds.has(id)) {
                desired.push(button.app);
                desiredIds.add(id);
            }
        }
        for (const app of running) {
            if (!desiredIds.has(app.get_id())) {
                desired.push(app);
                desiredIds.add(app.get_id());
            }
        }

        for (const [id, button] of this._buttons) {
            if (!desiredIds.has(id)) {
                button.destroy();
                this._buttons.delete(id);
            }
        }

        const ordered = new Map();
        desired.forEach((app, index) => {
            const id = app.get_id();
            let button = this._buttons.get(id);
            if (!button) {
                button = new AppButton(app, this._menuManager,
                    this._notificationsMonitor, this._settings);
                this.insert_child_at_index(button, index);
            } else {
                if (this.get_child_at_index(index) !== button)
                    this.set_child_at_index(button, index);
                button.update();
            }
            ordered.set(id, button);
        });
        this._buttons = ordered;
    }

    _onDestroy() {
        this._destroyed = true;
        this._buttons.clear();
        this._workspaceSwitcherPopup?.destroy();
        Object.values(PANEL_SIZE_CLASSES).forEach(cls =>
            Main.panel.remove_style_class_name(cls));

        // Restore the native panel: top edge, clock in the center box.
        const monitor = Main.layoutManager.primaryMonitor;
        if (monitor)
            Main.layoutManager.panelBox.set_position(monitor.x, monitor.y);
        const container = Main.panel.statusArea.dateMenu.container;
        container.get_parent()?.remove_child(container);
        Main.panel._centerBox.insert_child_at_index(container, 0);
    }
});
