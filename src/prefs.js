import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class TaskbarPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup();
        page.add(group);
        window.add(page);

        const addComboRow = (key, title, subtitle, values, labels) => {
            const row = new Adw.ComboRow({
                title,
                subtitle,
                model: Gtk.StringList.new(labels),
                selected: Math.max(0, values.indexOf(settings.get_string(key))),
            });
            row.connect('notify::selected', () =>
                settings.set_string(key, values[row.selected]));
            settings.connect(`changed::${key}`, () => {
                row.selected = Math.max(0, values.indexOf(settings.get_string(key)));
            });
            group.add(row);
        };
        addComboRow('bar-position', 'Bar position', 'Screen edge for the top bar',
            ['top', 'bottom'], ['Top', 'Bottom']);
        addComboRow('size', 'Bar size', 'Top bar and icon size',
            ['normal', 'large', 'extra-large'], ['Normal', 'Large', 'Extra Large']);
        addComboRow('spacing', 'Icon spacing', 'Distance between icons',
            ['small', 'normal', 'large'], ['Small', 'Normal', 'Large']);
        addComboRow('clock-position', 'Clock position', 'Where the clock is shown',
            ['center', 'right'], ['Center', 'Right']);

        const isolateRow = new Adw.SwitchRow({
            title: 'Workspace isolation',
            subtitle: 'Only show windows from the current workspace',
        });
        settings.bind('isolate-workspaces', isolateRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        group.add(isolateRow);

        const scrollRow = new Adw.SwitchRow({
            title: 'Scroll to change workspace',
            subtitle: 'Scrolling on the top bar switches workspace',
        });
        settings.bind('scroll-workspace', scrollRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        group.add(scrollRow);

        const badgesRow = new Adw.SwitchRow({
            title: 'Notification badges',
            subtitle: 'Unread notification count on app icons',
        });
        settings.bind('notification-badges', badgesRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        group.add(badgesRow);

        const resetGroup = new Adw.PreferencesGroup();
        page.add(resetGroup);
        const resetRow = new Adw.ButtonRow({title: 'Restore defaults'});
        resetRow.add_css_class('destructive-action');
        resetRow.connect('activated', () => {
            for (const key of settings.settings_schema.list_keys())
                settings.reset(key);
        });
        resetGroup.add(resetRow);
    }
}
