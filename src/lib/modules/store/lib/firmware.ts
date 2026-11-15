// What the `kind` and `tested` selects on a firmware record mean to a reader. The keys are the
// schema's values (1754000000_store.js in fmc_pocketbase) and change together with it.
import { DEFAULT_DEVICE } from "$lib/modules/market/lib/devices";

export interface FirmwareKind {
  label: string;
  /** A Material Symbols name. */
  icon: string;
  hint: string;
}

export const KINDS: Record<string, FirmwareKind> = {
  patched: {
    label: "Patched stock",
    icon: "build",
    hint: "The vendor firmware with a patch on top. Everything else stays stock.",
  },
  custom: {
    label: "Custom",
    icon: "science",
    hint: "Its own application: it replaces what the watch normally runs.",
  },
  stock: {
    label: "Stock",
    icon: "history",
    hint: "An untouched vendor image, kept for going back.",
  },
  // not an OTA image: loader.wp2app, installed over the App Loader's own channel into slot L
  loader: {
    label: "App Loader",
    icon: "apps",
    hint: "Not a firmware image: the part that runs the apps. It goes on over Bluetooth, no flashing, and needs the patched firmware.",
  },
};

/** The App Loader's loader package — installed, never flashed. */
export const isLoader = (kind: unknown) => kind === "loader";

const UNKNOWN: FirmwareKind = { label: "Firmware", icon: "memory", hint: "" };

export const firmwareKind = (kind: unknown): FirmwareKind => KINDS[String(kind)] ?? UNKNOWN;

/** Proven on a physical watch, or only in the emulator — or nobody said. */
export const testedOnHardware = (tested: unknown): boolean => tested === "hardware";
export const testedLabel = (tested: unknown): string =>
  tested === "hardware" ? "Tested on a watch" : tested === "emulator" ? "Emulator only" : "";

/**
 * The one watch FMC can flash: the OTA path (Watch.flashFirmware, ota-image.ts) is the Watch Pro
 * 2's alone. A record that doesn't name a device is for DEFAULT_DEVICE, like a face.
 */
export const OTA_DEVICE = "watch_pro_2";
export const recordDevice = (device: unknown): string => String(device || DEFAULT_DEVICE);
export const flashable = (device: unknown) => recordDevice(device) === OTA_DEVICE;
