import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const PREVIEW_WIDTH = 220;
const PREVIEW_HEIGHT = 130;

const WindowPreview = GObject.registerClass(
class WindowPreview extends St.Button {
    _init(window, closeMenu) {
        super._init({style_class: 'taskbar-window-preview', can_focus: true});
        this._window = window;

        const box = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style: 'spacing: 6px;',
        });
        this.set_child(box);

        const label = new St.Label({
            text: window.get_title() ?? '',
            style: `max-width: ${PREVIEW_WIDTH}px;`,
        });
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        box.add_child(label);

        const actor = window.get_compositor_private();
        const [width, height] = actor.get_size();
        const scale = Math.min(
            PREVIEW_WIDTH / width, PREVIEW_HEIGHT / height, 1);
        const clone = new Clutter.Clone({
            source: actor,
            width: Math.round(width * scale),
            height: Math.round(height * scale),
        });
        box.add_child(new St.Bin({
            child: clone,
            width: PREVIEW_WIDTH,
            height: PREVIEW_HEIGHT,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        }));

        this.connect('clicked', () => {
            Main.activateWindow(this._window);
            closeMenu();
        });
        this._window.connectObject('unmanaging', () => closeMenu(), this);
    }
});

export class WindowPreviewMenu extends PopupMenu.PopupMenu {
    constructor(sourceActor) {
        super(sourceActor, 0.5, St.Side.TOP);
        this.actor.hide();
        Main.uiGroup.add_child(this.actor);
        // Track the pointer so the AppButton can keep the menu open while
        // the pointer is inside it.
        this.box.track_hover = true;
        this.box.reactive = true;
    }

    updateWindows(windows) {
        this.removeAll();
        const item = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        const row = new St.BoxLayout({style: 'spacing: 8px;'});
        for (const window of windows)
            row.add_child(new WindowPreview(window, () => this.close()));
        item.add_child(row);
        this.addMenuItem(item);
    }
}
