'use strict';
// Fictional sample snapshot for OfflineReadiness — synthetic demo data.
// Not from a real home, not derived from any real Home Assistant instance.
// Classic-script wrapper so index.html works from file:// without fetch.
var OfflineReadinessSample = {
  label: 'Fictional sample snapshot — synthetic demo data, not from a real home.',
  snapshot: {
    schema: 'offline-readiness.snapshot/1',
    haVersion: '2026.9.2-fictional',
    generatedAt: '2026-10-05T09:30:00Z',
    entries: [
      { entryId: '01JFICT000000000000000001', domain: 'hue', title: 'Fictional Hue Bridge (hallway)', source: 'user' },
      { entryId: '01JFICT000000000000000002', domain: 'esphome', title: 'Fictional ESPHome node (attic)', source: 'user' },
      { entryId: '01JFICT000000000000000003', domain: 'tuya', title: 'Fictional Tuya bulbs', source: 'user' },
      { entryId: '01JFICT000000000000000004', domain: 'mqtt', title: 'Fictional MQTT link', source: 'user' },
      { entryId: '01JFICT000000000000000005', domain: 'met', title: 'Fictional weather (met.no)', source: 'user' },
      { entryId: '01JFICT000000000000000006', domain: 'wled', title: 'Fictional LED strip', source: 'discovery' },
      { entryId: '01JFICT000000000000000007', domain: 'spotify', title: 'Fictional Spotify account', source: 'user' },
      { entryId: '01JFICT000000000000000008', domain: 'my_custom_thing', title: 'Fictional custom integration', source: 'user' },
      { entryId: '01JFICT000000000000000009', domain: 'deconz', title: 'Fictional deCONZ gateway (disabled)', source: 'user', disabledBy: 'user' },
      { entryId: '01JFICT00000000000000000A', domain: 'plex', title: 'Fictional Plex server (unused)', source: 'user' }
    ],
    entities: [
      { entityId: 'light.hall_lamp', platform: 'hue', configEntryId: '01JFICT000000000000000001', deviceId: 'fict-dev-001', originalName: 'Hall lamp' },
      { entityId: 'sensor.hall_illuminance', platform: 'hue', configEntryId: '01JFICT000000000000000001', deviceId: 'fict-dev-001', originalName: 'Hall illuminance' },
      { entityId: 'sensor.attic_temperature', platform: 'esphome', configEntryId: '01JFICT000000000000000002', deviceId: 'fict-dev-002', originalName: 'Attic temperature' },
      { entityId: 'switch.attic_fan', platform: 'esphome', configEntryId: '01JFICT000000000000000002', deviceId: 'fict-dev-002', originalName: 'Attic fan' },
      { entityId: 'light.bulb_one', platform: 'tuya', configEntryId: '01JFICT000000000000000003', deviceId: 'fict-dev-003', originalName: 'Bulb one' },
      { entityId: 'light.bulb_two', platform: 'tuya', configEntryId: '01JFICT000000000000000003', deviceId: 'fict-dev-003', originalName: 'Bulb two' },
      { entityId: 'sensor.mqtt_workshop_temp', platform: 'mqtt', configEntryId: '01JFICT000000000000000004', deviceId: null, originalName: 'Workshop temperature' },
      { entityId: 'weather.fictional_home', platform: 'met', configEntryId: '01JFICT000000000000000005', deviceId: null, originalName: 'Fictional home' },
      { entityId: 'light.strip', platform: 'wled', configEntryId: '01JFICT000000000000000006', deviceId: 'fict-dev-004', originalName: 'LED strip' },
      { entityId: 'media_player.fictional_spotify', platform: 'spotify', configEntryId: '01JFICT000000000000000007', deviceId: null, originalName: 'Fictional Spotify' },
      { entityId: 'light.computed_lamp', platform: 'template', configEntryId: null, deviceId: null, originalName: 'Computed lamp (template)' },
      { entityId: 'sensor.grouped_temperature', platform: 'group', configEntryId: null, deviceId: null, originalName: 'Grouped temperature' },
      { entityId: 'sensor.ghost_probe', platform: 'esphome', configEntryId: '01JFICT00000000000000MISSING', deviceId: null, originalName: 'Ghost probe' },
      { entityId: 'sensor.unlinked_air', platform: 'esphome', configEntryId: null, deviceId: null, originalName: 'Unlinked air sensor' }
    ],
    devices: [
      { deviceId: 'fict-dev-001', configEntries: ['01JFICT000000000000000001'], manufacturer: 'Signify (fictional)', model: 'LCT001 (fictional)', name: 'Hall bridge', swVersion: '1.2.3-fictional' },
      { deviceId: 'fict-dev-002', configEntries: ['01JFICT000000000000000002'], manufacturer: 'Espressif (fictional)', model: 'ESP32 devkit (fictional)', name: 'Attic node' },
      { deviceId: 'fict-dev-003', configEntries: ['01JFICT000000000000000003'], manufacturer: 'Tuya (fictional)', model: 'Bulb (fictional)', name: 'Bulbs hub' },
      { deviceId: 'fict-dev-004', configEntries: ['01JFICT000000000000000006'], manufacturer: 'WLED (fictional)', model: 'ESP8266 strip controller (fictional)', name: 'LED controller' },
      { deviceId: 'fict-dev-005', configEntries: [], manufacturer: 'Fictional OEM', model: 'Orphan relay (fictional)', name: 'Orphan relay' },
      { deviceId: 'fict-dev-006', configEntries: ['01JFICT000000000000000002'], manufacturer: 'Fictional OEM', model: 'Child sensor (fictional)', name: 'Child sensor', viaDeviceId: 'fict-dev-999' }
    ]
  }
};
if (typeof window !== 'undefined') { window.OfflineReadinessSample = OfflineReadinessSample; }
if (typeof module !== 'undefined' && module.exports) { module.exports = OfflineReadinessSample; }
