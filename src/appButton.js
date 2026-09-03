import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {AppMenu} from 'resource:///org/gnome/shell/ui/appMenu.js';

import {WindowPreviewMenu} from './windowPreview.js';

// Icon and dash metrics per 'size' setting, kept proportional.
const SIZE_PARAMS = {
    normal: {icon: 24, dashWidth: 5, dashHeight: 3, strip: 5, badgeFont: 11},
    large: {icon: 28, dashWidth: 7, dashHeight: 4, strip: 7, badgeFont: 13},
    'extra-large': {icon: 32, dashWidth: 8, dashHeight: 5, strip: 8, badgeFont: 15},
};
const MAX_DASHES = 4;
const DASH_SPACING = 2;
const PREVIEW_SHOW_DELAY_MS = 600;
const PREVIEW_HIDE_DELAY_MS = 300;
// Fallback when global.stage.get_accent_color() is unavailable (GNOME default blue).
const FALLBACK_ACCENT = {red: 53, green: 132, blue: 228, alpha: 255};

/** App windows shown on the taskbar: skip-taskbar excluded, optionally
 *  filtered to the active workspace. MRU order (Shell.App sorts by user time). */
export function getAppWindows(app, settings) {
    let windows = app.get_windows().filter(w => !w.skip_taskbar);
    if (settings.get_boolean('isolate-workspaces')) {
        const active = global.workspace_manager.get_active_workspace();
        // located_on_workspace(), not get_workspace(): it also matches windows
        // set to appear on all workspaces.
        windows = windows.filter(w => w.located_on_workspace(active));
    }
    return windows;
}

/**
 * One icon-only button for a single app: launches/cycles windows on click,
 * draws one dash per open window below the icon (accent color when focused,
 * white otherwise) and an iOS-like red badge with the unread notification count.
 */
export const AppButton = GObject.registerClass(
class AppButton extends St.Widget {
    _init(app, menuManager, notificationsMonitor, settings) {
        super._init({
            style_class: 'panel-button taskbar-app-button',
            layout_manager: new Clutter.BinLayout(),
            reactive: true,
            track_hover: true,
            can_focus: true,
            y_expand: true,
        });
        this.app = app;
        this._menuManager = menuManager;
        this._notificationsMonitor = notificationsMonitor;
        this._settings = settings;
        this._sizeParams = SIZE_PARAMS[settings.get_string('size')] ?? SIZE_PARAMS.normal;
        this._windowCount = 0;
        this._isFocused = false;

        // Vertical layout so the dashes never overlap the icon.
        const box = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_expand: true,
        });
        box.add_child(new St.Bin({
            child: app.create_icon_texture(this._sizeParams.icon),
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        this._indicator = new St.DrawingArea({
            style: `height: ${this._sizeParams.strip}px;`,
            x_expand: true,
        });
        this._indicator.connect('repaint', area => this._drawIndicator(area));
        box.add_child(this._indicator);
        this.add_child(box);

        this._badge = new St.Label({
            style_class: 'taskbar-notification-badge',
            style: `font-size: ${this._sizeParams.badgeFont}px;`,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.START,
            visible: false,
        });
        this.add_child(this._badge);

        const clickGesture = new Clutter.ClickGesture();
        clickGesture.connect('recognize', gesture => this._onClicked(gesture));
        this.add_action(clickGesture);

        this.app.connectObject('windows-changed', () => this.update(), this);
        this.connect('notify::hover', () => this._onHoverChanged());
        this.connect('destroy', () => this._onDestroy());

        this.update();
    }

    _getWindows() {
        return getAppWindows(this.app, this._settings);
    }

    update() {
        this._windowCount = this._getWindows().length;
        this._isFocused = this._windowCount > 0 &&
            Shell.WindowTracker.get_default().focus_app === this.app;
        if (this._isFocused)
            this.add_style_class_name('taskbar-app-button-focused');
        else
            this.remove_style_class_name('taskbar-app-button-focused');
        this._indicator.queue_repaint();

        const count = this._settings.get_boolean('notification-badges')
            ? this._notificationsMonitor.countFor(this.app.get_id()) : 0;
        this._badge.visible = count > 0;
        if (count > 0)
            this._badge.text = count > 9 ? '9+' : `${count}`;
    }

    _onHoverChanged() {
        if (this.hover) {
            this._cancelTimeout('_previewCloseId');
            if (this._windowCount > 0 && !this._previewMenu?.isOpen &&
                !this._menu?.isOpen)
                this._schedulePreviewOpen();
        } else {
            this._cancelTimeout('_previewShowId');
            this._schedulePreviewClose();
        }
    }

    _cancelTimeout(idProperty) {
        if (this[idProperty]) {
            GLib.Source.remove(this[idProperty]);
            this[idProperty] = null;
        }
    }

    _schedulePreviewOpen() {
        if (this._previewShowId)
            return;
        this._previewShowId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, PREVIEW_SHOW_DELAY_MS, () => {
                this._previewShowId = null;
                this._openPreview();
                return GLib.SOURCE_REMOVE;
            });
    }

    _schedulePreviewClose() {
        this._cancelTimeout('_previewCloseId');
        this._previewCloseId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, PREVIEW_HIDE_DELAY_MS, () => {
                this._previewCloseId = null;
                if (!this.hover && !this._previewMenu?.box.hover)
                    this._previewMenu?.close();
                return GLib.SOURCE_REMOVE;
            });
    }

    _openPreview() {
        if (this._menu?.isOpen || this._windowCount === 0)
            return;
        if (!this._previewMenu) {
            // Deliberately NOT added to the menu manager: its grab would send a
            // phantom leave-event to the button, closing the menu right away.
            this._previewMenu = new WindowPreviewMenu(this);
            this._previewMenu.box.connectObject('notify::hover', () => {
                if (this._previewMenu.box.hover)
                    this._cancelTimeout('_previewCloseId');
                else
                    this._schedulePreviewClose();
            }, this);
        }
        this._previewMenu.updateWindows(this._getWindows());
        this._previewMenu.open();
    }

    _onClicked(gesture) {
        this._cancelTimeout('_previewShowId');
        this._previewMenu?.close();
        const button = gesture.get_button();
        const isPrimaryOrTouch = button === Clutter.BUTTON_PRIMARY || button === 0;
        if (isPrimaryOrTouch) {
            this._animateClick();
            this._activate();
        } else if (button === Clutter.BUTTON_MIDDLE) {
            this._animateClick();
            this.app.open_new_window(-1);
        } else if (button === Clutter.BUTTON_SECONDARY) {
            this._openMenu();
        }
    }

    _animateClick() {
        this.set_pivot_point(0.5, 0.5);
        this.ease({
            scale_x: 0.8,
            scale_y: 0.8,
            duration: 80,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this.ease({
                scale_x: 1.0,
                scale_y: 1.0,
                duration: 150,
                mode: Clutter.AnimationMode.EASE_OUT_BACK,
            }),
        });
    }

    _activate() {
        // MRU order (Shell.App sorts by user time).
        const windows = this._getWindows();
        if (windows.length === 0) {
            this.app.activate();
            return;
        }

        // Cycle in stable order so repeated clicks visit every window; with a
        // single window this just re-focuses it. Never minimizes.
        const sorted = [...windows].sort(
            (a, b) => a.get_stable_sequence() - b.get_stable_sequence());
        // A window only counts as focused if it also sits on the active
        // workspace: after a workspace switch the focus can stay behind on the
        // previous one, and treating that as focused would cycle (or, worse,
        // minimize) instead of jumping to the app where it actually is.
        const active = global.workspace_manager.get_active_workspace();
        const focusedIndex = sorted.findIndex(
            w => w.appears_focused && w.located_on_workspace(active));
        const target = focusedIndex >= 0
            // Focused here: move to the next window in the cycle.
            ? sorted[(focusedIndex + 1) % sorted.length]
            // Otherwise go straight to the most recently used window,
            // switching workspace if it lives on another one.
            : windows[0];
        Main.activateWindow(target);
    }

    _openMenu() {
        if (!this._menu) {
            this._menu = new AppMenu(this, St.Side.TOP, {
                favoritesSection: true,
                showSingleWindows: true,
            });
            this._menu.blockSourceEvents = true;
            this._menu.setApp(this.app);
            Main.uiGroup.add_child(this._menu.actor);
            this._menuManager.addMenu(this._menu);
        }
        this._menu.open();
    }

    _drawIndicator(area) {
        const nDashes = Math.min(this._windowCount, MAX_DASHES);
        if (nDashes === 0)
            return;

        const cr = area.get_context();
        const [areaWidth, areaHeight] = area.get_surface_size();
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;

        if (this._isFocused) {
            const [accent] = global.stage.get_accent_color?.() ?? [FALLBACK_ACCENT];
            cr.setSourceRGBA(accent.red / 255, accent.green / 255,
                accent.blue / 255, accent.alpha / 255);
        } else {
            cr.setSourceRGBA(1, 1, 1, 1);
        }

        const dashHeight = this._sizeParams.dashHeight * scale;
        const spacing = DASH_SPACING * scale;
        // Shrink the dashes if needed so they always all fit in the area.
        const dashWidth = Math.min(this._sizeParams.dashWidth * scale,
            (areaWidth - (nDashes - 1) * spacing) / nDashes);
        const totalWidth = nDashes * dashWidth + (nDashes - 1) * spacing;
        let x = (areaWidth - totalWidth) / 2;
        // Centered in the strip, so the dashes never stick to the bar edge.
        const y = (areaHeight - dashHeight) / 2;

        const radius = dashHeight / 2;
        for (let i = 0; i < nDashes; i++) {
            // Stadium-shaped dash: two half-circle caps joined by straight edges.
            cr.newSubPath();
            cr.arc(x + dashWidth - radius, y + radius, radius, -Math.PI / 2, Math.PI / 2);
            cr.arc(x + radius, y + radius, radius, Math.PI / 2, 3 * Math.PI / 2);
            cr.closePath();
            x += dashWidth + spacing;
        }
        cr.fill();
        cr.$dispose();
    }

    _onDestroy() {
        this._cancelTimeout('_previewShowId');
        this._cancelTimeout('_previewCloseId');
        this._previewMenu?.destroy();
        this._previewMenu = null;
        this._menu?.destroy();
        this._menu = null;
    }
});
