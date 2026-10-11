'use strict';
// Classic-script wrapper so index.html works from file:// without fetch.
// Generated from data/classifications.json — keep byte-identical in content.
var OfflineReadinessClassifications = {
  "schema": "offline-readiness.classifications/1",
  "generated": "2026-10-11",
  "source": {
    "repository": "home-assistant/core",
    "ref": "2026.10.1",
    "refType": "release tag",
    "releasePublished": "2026-10-10T16:14:23Z",
    "manifestPathTemplate": "homeassistant/components/<domain>/manifest.json",
    "manifestBaseUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/",
    "retrieved": "2026-10-11",
    "docs": [
      {
        "url": "https://developers.home-assistant.io/docs/creating_integration_manifest/",
        "retrieved": "2026-10-11",
        "scope": "Integration manifest reference. The IoT class section defines the accepted classes; the exact wording is quoted in docs/verification.md and used as the mapping source."
      },
      {
        "url": "https://www.home-assistant.io/integrations/",
        "retrieved": "2026-10-11",
        "scope": "Public integrations listing; its IoT Class filter lists Local Push, Local Polling, Cloud Push, Cloud Polling, Assumed State, Calculated and Configurable. Used only for bounded differentiation."
      },
      {
        "url": "https://www.home-assistant.io/blog/2016/02/12/classifying-the-internet-of-things/#classifiers",
        "retrieved": "2026-10-11",
        "scope": "Background blog post referenced by the manifest documentation for the meaning of the IoT classes."
      }
    ]
  },
  "policy": {
    "categoryMapping": {
      "local_polling": "local",
      "local_push": "local",
      "cloud_polling": "cloud",
      "cloud_push": "cloud",
      "assumed_state": "unknown",
      "calculated": "unknown"
    },
    "categoryMappingNotes": "The mapping above is this tool's policy applied to the iot_class values Home Assistant defines. assumed_state and calculated both map to unknown: neither declares local or cloud device communication, and this tool does not infer one.",
    "unmappedDomainCategory": "custom",
    "unmappedDomainNote": "A domain absent from this bundle is reported as custom/unlisted: it may be a custom integration or a core integration outside this bounded bundle. Locality is never assumed local for it.",
    "dynamicDomains": {
      "template": "Template entities derive state from other entities and template logic. This tool does not evaluate templates, so locality is unknown.",
      "group": "Group entities aggregate member entities. Locality depends on the members, which this tool does not resolve transitively."
    },
    "staleAfterDays": 180,
    "staleNote": "Evidence older than staleAfterDays (compared with the viewing date) is flagged stale wherever it appears; the category is not changed by staleness."
  },
  "entries": {
    "androidtv": {
      "name": "Android Debug Bridge",
      "integrationType": "device",
      "iotClass": "local_polling",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/androidtv/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "Android TV devices are polled on the local network (manifest local_polling)."
    },
    "apple_tv": {
      "name": "Apple TV",
      "integrationType": "device",
      "iotClass": "local_push",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/apple_tv/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "Apple TV / AirPlay devices are reached over the local network (manifest local_push)."
    },
    "bluetooth": {
      "name": "Bluetooth",
      "integrationType": null,
      "iotClass": "local_push",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/bluetooth/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "Bluetooth devices are reached through a local adapter (manifest local_push)."
    },
    "cast": {
      "name": "Google Cast",
      "integrationType": "hub",
      "iotClass": "local_polling",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/cast/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "Chromecast / Google Cast devices are polled over the local network (manifest local_polling)."
    },
    "cloud": {
      "name": "Home Assistant Cloud",
      "integrationType": "system",
      "iotClass": "cloud_push",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/cloud/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "Home Assistant Cloud (Nabu Casa) is a cloud service (manifest cloud_push); the class declares an active internet connection."
    },
    "deconz": {
      "name": "deCONZ",
      "integrationType": "hub",
      "iotClass": "local_push",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/deconz/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "deCONZ gateways are reached over the local network (manifest local_push)."
    },
    "demo": {
      "name": "Demo",
      "integrationType": null,
      "iotClass": "calculated",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/demo/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "The manifest declares iot_class calculated: a demonstration integration that does not communicate with devices."
    },
    "dlna_dmr": {
      "name": "DLNA Digital Media Renderer",
      "integrationType": "device",
      "iotClass": "local_push",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/dlna_dmr/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "DLNA media renderers are reached over the local network (manifest local_push)."
    },
    "ecobee": {
      "name": "ecobee",
      "integrationType": "hub",
      "iotClass": "cloud_polling",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/ecobee/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "Ecobee thermostats are polled through the Ecobee cloud (manifest cloud_polling); the class declares an active internet connection."
    },
    "esphome": {
      "name": "ESPHome",
      "integrationType": "device",
      "iotClass": "local_push",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/esphome/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "ESPHome devices are reached directly on the local network (manifest local_push)."
    },
    "group": {
      "name": "Group",
      "integrationType": "helper",
      "iotClass": "calculated",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/group/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "The manifest declares iot_class calculated: the integration does not handle communication on its own; group state aggregates member entities, so locality depends on the members and is not evaluated here.",
      "qualifiers": [
        "dynamic platform policy applies to entities"
      ]
    },
    "homekit_controller": {
      "name": "HomeKit Device",
      "integrationType": "device",
      "iotClass": "local_push",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/homekit_controller/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "HomeKit accessories are reached over the local network (manifest local_push)."
    },
    "hue": {
      "name": "Philips Hue",
      "integrationType": "hub",
      "iotClass": "local_push",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/hue/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "Philips Hue bridges are controlled over the local network; the manifest declares local_push. A Hue account or Hue-cloud features are not required by this evidence and are out of scope.",
      "qualifiers": [
        "cloud account optional"
      ]
    },
    "input_boolean": {
      "name": "Input boolean",
      "integrationType": "helper",
      "iotClass": null,
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/input_boolean/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "Helper integration; the manifest declares no iot_class, so locality is unknown from this evidence. Helpers do not communicate with devices themselves.",
      "iotClassMissing": true
    },
    "ipp": {
      "name": "Internet Printing Protocol (IPP)",
      "integrationType": "device",
      "iotClass": "local_polling",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/ipp/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "Network printers are polled directly on the local network (manifest local_polling)."
    },
    "lifx": {
      "name": "LIFX",
      "integrationType": "device",
      "iotClass": "local_polling",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/lifx/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "LIFX devices are polled on the local network (manifest local_polling)."
    },
    "met": {
      "name": "Meteorologisk institutt (Met.no)",
      "integrationType": "service",
      "iotClass": "cloud_polling",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/met/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "Weather data is fetched from the met.no cloud service (manifest cloud_polling); the class declares an active internet connection."
    },
    "mobile_app": {
      "name": "Mobile App",
      "integrationType": "device",
      "iotClass": "local_push",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/mobile_app/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "The companion app pushes state to Home Assistant; the manifest declares local_push. Remote connectivity depends on configured remote access (for example Home Assistant Cloud) and is out of scope.",
      "qualifiers": [
        "remote access configuration not covered"
      ]
    },
    "mqtt": {
      "name": "MQTT",
      "integrationType": "service",
      "iotClass": "local_push",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/mqtt/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "The manifest declares local_push, but MQTT entities communicate with a user-configured broker whose location (LAN or remote) cannot be verified from bundled evidence; treated conservatively as unknown locality.",
      "qualifiers": [
        "broker endpoint is user-configured"
      ],
      "override": {
        "category": "unknown",
        "reason": "configured_broker_locality_unverified",
        "overrideNote": "Bundled policy: the broker endpoint is user-configured, so local communication is not assumed from the manifest class alone."
      }
    },
    "nest": {
      "name": "Google Nest",
      "integrationType": "hub",
      "iotClass": "cloud_push",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/nest/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "Nest devices are reached through the Google cloud (manifest cloud_push); the class declares an active internet connection."
    },
    "plex": {
      "name": "Plex Media Server",
      "integrationType": "service",
      "iotClass": "local_push",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/plex/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "Plex servers are reached over the local network (manifest local_push)."
    },
    "samsungtv": {
      "name": "Samsung Smart TV",
      "integrationType": "device",
      "iotClass": "local_push",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/samsungtv/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "Samsung TVs are reached over the local network (manifest local_push)."
    },
    "shelly": {
      "name": "Shelly",
      "integrationType": "device",
      "iotClass": "local_push",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/shelly/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "Shelly devices are reached directly on the local network (manifest local_push)."
    },
    "smartthings": {
      "name": "SmartThings",
      "integrationType": "hub",
      "iotClass": "cloud_push",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/smartthings/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "SmartThings devices are reached through the Samsung cloud (manifest cloud_push); the class declares an active internet connection."
    },
    "sonos": {
      "name": "Sonos",
      "integrationType": "hub",
      "iotClass": "local_push",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/sonos/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "Sonos players are reached over the local network (manifest local_push)."
    },
    "spotify": {
      "name": "Spotify",
      "integrationType": "service",
      "iotClass": "cloud_polling",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/spotify/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "Spotify playback state comes from the Spotify cloud service (manifest cloud_polling); the class declares an active internet connection."
    },
    "sun": {
      "name": "Sun",
      "integrationType": "service",
      "iotClass": "calculated",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/sun/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "The manifest declares iot_class calculated: the integration computes sun position locally and does not communicate with devices."
    },
    "template": {
      "name": "Template",
      "integrationType": "helper",
      "iotClass": "local_push",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/template/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "Helper integration; the manifest declares local_push for the integration itself, but template entities derive state from other entities and template logic, which this tool does not evaluate (see dynamic-platform policy).",
      "qualifiers": [
        "dynamic platform policy applies to entities"
      ]
    },
    "tradfri": {
      "name": "IKEA TRÅDFRI",
      "integrationType": "hub",
      "iotClass": "local_polling",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/tradfri/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "IKEA TRADFRI gateways are polled on the local network (manifest local_polling)."
    },
    "tuya": {
      "name": "Tuya",
      "integrationType": "hub",
      "iotClass": "cloud_push",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/tuya/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "Tuya devices are reached through the Tuya cloud (manifest cloud_push); the manifest class declares an active internet connection."
    },
    "wled": {
      "name": "WLED",
      "integrationType": "device",
      "iotClass": "local_push",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/wled/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "WLED devices are reached directly on the local network (manifest local_push)."
    },
    "xiaomi_miio": {
      "name": "Xiaomi Home",
      "integrationType": "hub",
      "iotClass": "local_polling",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/xiaomi_miio/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "Xiaomi devices are polled on the local network (manifest local_polling). A cloud token may be involved during setup; setup flows are out of scope.",
      "qualifiers": [
        "cloud token may be involved at setup"
      ]
    },
    "zha": {
      "name": "Zigbee Home Automation",
      "integrationType": "hub",
      "iotClass": "local_polling",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/zha/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "Zigbee devices are reached through a local radio adapter (manifest local_polling)."
    },
    "zwave_js": {
      "name": "Z-Wave",
      "integrationType": "hub",
      "iotClass": "local_push",
      "sourceUrl": "https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/zwave_js/manifest.json",
      "retrieved": "2026-10-11",
      "scope": "Home Assistant core integration manifest (iot_class field) at home-assistant/core tag 2026.10.1. Describes the communication model the integration declares; it is not a verified measurement of device runtime behavior.",
      "notes": "Z-Wave devices are reached through a local controller (manifest local_push)."
    }
  }
};
if (typeof window !== 'undefined') { window.OfflineReadinessClassifications = OfflineReadinessClassifications; }
if (typeof module !== 'undefined' && module.exports) { module.exports = OfflineReadinessClassifications; }
