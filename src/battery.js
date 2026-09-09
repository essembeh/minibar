import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import UPower from 'gi://UPowerGlib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {QuickToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';

const BUS_NAME = 'org.freedesktop.UPower';
const OBJECT_PATH = '/org/freedesktop/UPower';

const UPowerInterface = `
<node>
  <interface name="org.freedesktop.UPower">
    <method name="EnumerateDevices">
      <arg type="ao" direction="out" name="devices"/>
    </method>
  </interface>
</node>`;

// Only the members we use. The shell ships its own UPower.Device XML
// (gnome-shell-dbus-interfaces) but it stops at ChargeThresholdEnabled: the
// thresholds and EnableChargeThreshold() are not in it, so declare them here.
// Note the composite /devices/DisplayDevice the shell talks to always reports
// ChargeThresholdSupported=false — the real battery device is the only source.
const DeviceInterface = `
<node>
  <interface name="org.freedesktop.UPower.Device">
    <method name="EnableChargeThreshold">
      <arg type="b" direction="in" name="enable"/>
    </method>
    <property name="Type" type="u" access="read"/>
    <property name="ChargeStartThreshold" type="u" access="read"/>
    <property name="ChargeEndThreshold" type="u" access="read"/>
    <property name="ChargeThresholdEnabled" type="b" access="read"/>
    <property name="ChargeThresholdSupported" type="b" access="read"/>
  </interface>
</node>`;

const UPowerProxy = Gio.DBusProxy.makeProxyWrapper(UPowerInterface);
const DeviceProxy = Gio.DBusProxy.makeProxyWrapper(DeviceInterface);

/** Promisified proxy construction (the wrappers only take a callback). */
function makeProxy(Wrapper, path) {
    return new Promise((resolve, reject) => {
        new Wrapper(Gio.DBus.system, BUS_NAME, path,
            (proxy, error) => error ? reject(error) : resolve(proxy));
    });
}

/**
 * Quick settings toggle mirroring the "Battery Charge" switch of the
 * Settings › Power panel: on = preserve battery health (UPower keeps the
 * charge inside the firmware thresholds), off = charge to 100%.
 */
const ChargeLimitToggle = GObject.registerClass(
class ChargeLimitToggle extends QuickToggle {
    _init(proxy) {
        super._init({
            title: 'Charge Limit',
            iconName: 'battery-good-symbolic',
        });
        this._proxy = proxy;

        // No toggleMode: the checked state follows UPower, never the click,
        // so a refused or failed call cannot leave the toggle lying.
        this.connectObject('clicked', () => this._toggle(), this);
        this._proxy.connectObject('g-properties-changed', () => this._sync(), this);
        this._sync();
    }

    _toggle() {
        this._proxy.EnableChargeThresholdAsync(!this.checked).catch(error => {
            logError(error, 'minibar: cannot change the battery charge limit');
            this._sync();
        });
    }

    _sync() {
        const checked = this._proxy.ChargeThresholdEnabled;
        const end = this._proxy.ChargeEndThreshold;
        this.set({
            checked,
            // Thresholds read 0 when the limit is off, and firmwares that only
            // expose a start threshold report an end of 0 too.
            subtitle: checked && end > 0 && end < 100 ? `${end}%` : '',
        });
    }
});

const ChargeLimitIndicator = GObject.registerClass(
class ChargeLimitIndicator extends SystemIndicator {
    _init(proxy) {
        super._init();
        this.quickSettingsItems.push(new ChargeLimitToggle(proxy));
    }
});

/**
 * Adds the charge limit toggle to the system quick settings, but only when
 * UPower reports a battery whose firmware supports charge thresholds
 * (desktops, older laptops and unsupported firmwares get nothing at all).
 * The lookup runs once at enable(); batteries are not expected to hotplug.
 */
export class BatteryChargeLimit {
    constructor(settings) {
        this._settings = settings;
        this._destroyed = false;
        this._proxy = null;
        this._indicator = null;

        this._settings.connectObject(
            'changed::battery-toggle', () => this._sync(), this);
        this._findBattery().catch(error =>
            logError(error, 'minibar: cannot query UPower'));
    }

    async _findBattery() {
        const upower = await makeProxy(UPowerProxy, OBJECT_PATH);
        const [paths] = await upower.EnumerateDevicesAsync();

        for (const path of paths) {
            if (this._destroyed)
                return;
            const device = await makeProxy(DeviceProxy, path);
            if (device.Type === UPower.DeviceKind.BATTERY && device.ChargeThresholdSupported) {
                this._proxy = device;
                break;
            }
        }

        if (!this._destroyed)
            this._sync();
    }

    _sync() {
        const wanted = this._proxy !== null &&
            this._settings.get_boolean('battery-toggle');
        if (wanted === (this._indicator !== null))
            return;

        if (wanted) {
            this._indicator = new ChargeLimitIndicator(this._proxy);
            Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
        } else {
            // The grid holds the items, the panel holds the indicator: both
            // have to go (addExternalIndicator() has no counterpart).
            this._indicator.quickSettingsItems.forEach(item => item.destroy());
            this._indicator.destroy();
            this._indicator = null;
        }
    }

    destroy() {
        this._destroyed = true;
        this._settings.disconnectObject(this);
        this._proxy = null;
        this._sync();
        this._settings = null;
    }
}
