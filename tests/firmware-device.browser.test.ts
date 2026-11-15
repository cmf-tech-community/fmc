// Which watch a firmware record is for decides whether FMC offers to flash it. The OTA path is
// the Watch Pro 2's alone, so another watch's image (the Watch 3 Pro's stock 1.0.1.77) is a
// download with a red plate and no Install button, and the model drops a flash of it even if
// something fires the event — the board check in ota-image.ts is only the second line. A stock
// Watch Pro 2 image goes the ordinary way, and with no stub in it, no badge claims it's there.
import { test, expect, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import type { RecordModel } from "pocketbase";
import { allSettled, fork } from "effector";
import { bleModel } from "$lib/modules/device/model";
import { storeModel } from "$lib/modules/store/model";
import * as storeApi from "$lib/modules/store/model/store.api";
import { FirmwarePage, FirmwaresPage } from "$lib/modules/store/pages";

vi.mock("$lib/modules/device/lib/ble", async (importOriginal) => {
  class Watch {
    serial = null;
    battery = 80;
    name = "CMF Watch Pro 2-9A9D";
    onDials = () => {};
    async connect() {
      return { name: this.name, battery: this.battery, firmware: null, serial: null };
    }
    async readWp2() {
      return null; // a stock watch doesn't answer
    }
    mergeDials() {}
  }

  return { ...(await importOriginal<object>()), Watch };
});

const fw = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, name: id, image: `${id}.bin`, ...extra }) as unknown as RecordModel;
const w3p = fw("w3p", { kind: "stock", version: "1.0.1.77", device: "watch_3_pro" });
const wp2Stock = fw("wp2", { kind: "stock", version: "1.0.0.73", device: "watch_pro_2" });
const patched = fw("patched", { kind: "patched", stub: 3 });

storeApi.loadFirmwaresFx.use(() => [w3p, wp2Stock]);
storeApi.loadFirmwareFx.use((id) => [w3p, wp2Stock].find((r) => r.id === id)!);

const connect = async () => {
  bleModel.connectRequested();
  await vi.waitFor(() => expect(bleModel.$bleInfo.getState()).not.toBeNull());
};

test("the shelf says which watch each image is for", async () => {
  const screen = await render(FirmwaresPage);

  await expect.element(screen.getByText("Watch 3 Pro", { exact: true })).toBeInTheDocument();
  await expect.element(screen.getByText("Watch Pro 2", { exact: true })).toBeInTheDocument();
  expect(screen.container.textContent).not.toMatch(/coming soon/i);
});

test("a Watch 3 Pro image is a download: a red plate, no Install", async () => {
  await connect();
  const screen = await render(FirmwarePage, { id: "w3p" });

  await expect.element(screen.getByText(/Only for the CMF Watch 3 Pro/)).toBeInTheDocument();
  await expect.element(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Install" }).elements()).toHaveLength(0);
  expect(screen.getByRole("button", { name: "Connect" }).elements()).toHaveLength(0);
});

test("a stock Watch Pro 2 image has Install behind the tick", async () => {
  await connect();
  const screen = await render(FirmwarePage, { id: "wp2" });
  const install = screen.getByRole("button", { name: "Install" });

  await expect.element(install).toBeDisabled();
  await screen.getByText("I accept the risk").click();
  await expect.element(install).toBeEnabled();
  expect(screen.container.textContent).not.toMatch(/Only for the/);
});

test("the model fetches a Watch Pro 2 image for flashing, never another watch's", async () => {
  const fetched: string[] = [];
  const flash = (rec: RecordModel) =>
    fork({
      values: [
        [storeModel.$firmware, rec],
        [storeModel.$riskAccepted, true],
      ],
      handlers: [
        [
          storeApi.fetchFirmwareImageFx,
          ({ rec }: storeApi.ImageFetch) => (fetched.push(rec.id), new Uint8Array(0)),
        ],
      ],
    });

  await allSettled(storeModel.flashRequested, { scope: flash(w3p) });
  await allSettled(storeModel.loaderInstallRequested, { scope: flash({ ...w3p, kind: "loader" }) });
  expect(fetched).toEqual([]);

  await allSettled(storeModel.flashRequested, { scope: flash(wp2Stock) });
  expect(fetched).toEqual(["wp2"]);
});

test("no Installed/Update badge for a stock image or another watch's", () => {
  const scope = fork({
    values: [
      [bleModel.$wp2, { stub: { version: 3, abiMinor: 0 }, loader: null, apps: {} }],
      [storeModel.$firmwares, [wp2Stock, { ...w3p, stub: 4 }, patched]],
    ],
  });

  expect(scope.getState(storeModel.$firmwaresOnWatch)).toEqual({
    wp2: null,
    w3p: null,
    patched: "installed",
  });
});
