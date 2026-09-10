import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {SIZE_PARAMS} from './appButton.js';

/**
 * Optional button opening the native overview app grid: no custom menu, the
 * shell already provides search, folders, pagination and drag-and-drop
 * (see spec §2.9 for the rejected category-menu alternatives).
 */
export const AppsButton = GObject.registerClass(
class AppsButton extends St.Button {
    _init(settings) {
        super._init({
            style_class: 'panel-button taskbar-app-button',
            can_focus: true,
            y_expand: true,
        });
        const sizeParams = SIZE_PARAMS[settings.get_string('size')] ?? SIZE_PARAMS.normal;

        // Same vertical layout as an AppButton, with an empty strip in place of
        // the instance indicator, so every icon of the bar stays aligned.
        const box = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_expand: true,
        });
        box.add_child(new St.Bin({
            child: new St.Icon({
                icon_name: 'view-app-grid-symbolic',
                icon_size: sizeParams.icon,
            }),
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        box.add_child(new St.Widget({style: `height: ${sizeParams.strip}px;`}));
        this.set_child(box);

        this.connect('clicked', () => this._toggleAppGrid());
    }

    _toggleAppGrid() {
        // showApps() is what the native dash button itself calls; only the
        // already-showing-apps case needs the dash button state to close back.
        if (Main.overview.visible && Main.overview.dash?.showAppsButton?.checked)
            Main.overview.hide();
        else
            Main.overview.showApps();
    }
});
