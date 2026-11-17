// The slot count is what decides whether a flash is an append, an overwrite, or the "watch is
// full" dialog — and the watch is no help: a055 leaves out every dial that was side-loaded, so
// after a reconnect a full watch reports room it doesn't have. mergeDials is what closes that
// gap; these check it does, and that a dial the watch turns out not to have stops counting.
import { beforeEach, expect, test } from "vitest";
import {
  capacityOf,
  NoFreeSlotError,
  Watch,
  WF_CAPACITY,
  WF_CAPACITY_PRO3,
} from "$lib/modules/device/lib/ble";
import { CMD, Codec, dialId, UUID } from "$lib/modules/device/lib/ble-protocol";
import { dialLabel, rememberDial, unclaimDial } from "$lib/modules/device/lib/catalog-names";

const SERIAL = "TESTSERIAL01";
const OTHER = "TESTSERIAL02";

// mergeDials touches nothing but its own fields, so a bare Watch is a complete fixture — no
// GATT, no connection
const watchWith = (reported: number[], serial: string | null = SERIAL) => {
  const w = new Watch();

  w.reportedWf = reported;
  w.serial = serial;
  w.mergeDials();
  return w;
};

beforeEach(() => localStorage.removeItem("fmc_dial_names"));

test("a side-loaded dial keeps its slot counted across a reconnect", () => {
  rememberDial(4242, "mine", undefined, SERIAL);
  // fresh connection: a055 lists the five gallery dials and says nothing about ours
  const w = watchWith([1, 2, 3, 4, 5]);

  expect(w.installedWf).toEqual([1, 2, 3, 4, 5, 4242]);
  expect(w.installedWf.length).toBe(WF_CAPACITY); // full — the flash must ask for a slot
});

test("dials flashed onto a different watch don't count", () => {
  rememberDial(4242, "mine", undefined, OTHER);
  expect(watchWith([1, 2, 3, 4, 5]).installedWf).toEqual([1, 2, 3, 4, 5]);
});

test("a dial the watch already reports isn't counted twice", () => {
  rememberDial(4242, "mine", undefined, SERIAL);
  expect(watchWith([1, 4242]).installedWf).toEqual([1, 4242]);
});

test("without a serial only what the watch reported counts", () => {
  rememberDial(4242, "mine", undefined, SERIAL);
  expect(watchWith([1, 2], null).installedWf).toEqual([1, 2]);
});

test("unclaiming a dial the watch doesn't have frees its slot but keeps its name", () => {
  rememberDial(4242, "mine", undefined, SERIAL);
  const w = watchWith([1, 2, 3, 4, 5]);

  unclaimDial(4242); // what the stale-old_wf_id retry, and a successful overwrite, do
  w.mergeDials();
  expect(w.installedWf).toEqual([1, 2, 3, 4, 5]);
  // the watch may still have it — 0a doesn't say why — so the label has to survive the guess
  expect(dialLabel(4242, 0)).toBe("mine");
});

// A watch that takes every handshake and then answers each finished transfer with 0a — the
// only part of uploadWatchface that decides between the slot dialog and a dead-end error.
const refusingWatch = (reported: number[]) => {
  const w = watchWith(reported);

  w.waitFor = async () => new Uint8Array([1]);
  w.sendData = async (cmd) => {
    if (cmd === CMD.wfInit2Req)
      setTimeout(() => w.handlers.get(CMD.wfFinishAck1)?.(new Uint8Array([0x0a])));
  };
  return w;
};
// smallest file the upload's own sanity checks let through: magic at 4, name "T" at 8, and the
// header repeated as the trailer
const hdr = new Uint8Array(36);

hdr.set([1, 0, 0, 0, 84], 4);
const BIN = new Uint8Array([...hdr, ...hdr]);

test("re-flashing a dial gone from a full watch opens the slot dialog (#62)", async () => {
  // claimed here, gone from the watch since; a055 leaves out side-loaded dials, so one put
  // there from another browser or phone goes uncounted and the watch is fuller than it looks
  rememberDial(dialId("rec1"), "DosWatch", undefined, SERIAL);
  const w = refusingWatch([1, 2, 3, 4]);

  await expect(w.uploadWatchface(BIN, undefined, "rec1")).rejects.toBeInstanceOf(NoFreeSlotError);
});

test("0a again after the user picked a slot is an error, not the dialog again", async () => {
  rememberDial(4242, "mine", undefined, SERIAL);
  const w = refusingWatch([1, 2, 3, 4, 5]);
  const err = await w.uploadWatchface(BIN, 4242, "rec1").catch((e: Error) => e);

  expect(err).not.toBeInstanceOf(NoFreeSlotError);
  expect(err).toBeInstanceOf(Error);
});

test("a refused replace of a dial the watch listed keeps it and costs one transfer (#62)", async () => {
  const w = refusingWatch([273, 274, 275, 276, 277, 280]);
  let transfers = 0;
  const send = w.sendData;

  w.sendData = async (cmd, p) => {
    if (cmd === CMD.wfInit2Req) transfers++;
    return send(cmd, p);
  };
  // the watch says 0a to this target; the dial is still there and still another one's turn
  await expect(w.uploadWatchface(BIN, 276, "rec1")).rejects.toThrow(/pick a different dial/);
  expect(transfers).toBe(1);
  expect(w.installedWf).toContain(276);
});

// ---- the a055 header: ?? ‖ active ‖ dials on the watch ‖ capacity ----
const KEY = new Uint8Array(16).fill(7);
const u32 = (id: number) => [id & 0xff, (id >> 8) & 0xff, (id >> 16) & 0xff, id >>> 24];

// a watch that announces a055 the way a real one does, through the codec and onNotify
async function announce(w: Watch, header: number[], ids: number[]) {
  const peer = new Codec();

  await w.codec.setKey(KEY);
  await peer.setKey(KEY);
  const payload = new Uint8Array([...header, ...ids.flatMap(u32)]);

  for (const f of await peer.encode(CMD.wfInstalled, payload)) await w.onNotify(UUID.cmdRead, f);
}
// takes every handshake and accepts the finished file; counts the transfers it saw
const acceptingWatch = (w: Watch) => {
  const sent = { transfers: 0 };

  w.waitFor = async () => new Uint8Array([1]);
  w.sendData = async (cmd) => {
    if (cmd !== CMD.wfInit2Req) return;
    sent.transfers++;
    setTimeout(() => w.handlers.get(CMD.wfFinishAck1)?.(new Uint8Array([1])));
  };
  return sent;
};

test("the header's count and capacity are read off a055", async () => {
  rememberDial(4242, "mine", undefined, SERIAL);
  const w = watchWith([]);
  let seen = null;

  w.onDials = (_, slots) => (seen = slots);
  // §9.5d: five listed, one side-loaded the list leaves out, room for seven
  await announce(w, [1, 0, 6, 7], [1, 2, 3, 4, 5]);
  expect(w.reportedWf).toEqual([1, 2, 3, 4, 5]);
  expect(seen).toEqual({ used: 6, capacity: 7 });
});

test("a header that says full opens the slot dialog before anything is sent", async () => {
  const w = watchWith([]);
  const sent = acceptingWatch(w);

  // seven on the watch, only six listed: the merged list alone would still see room
  await announce(w, [1, 6, 7, 7], [1, 2, 3, 4, 5, 6]);
  await expect(w.uploadWatchface(BIN, undefined, "rec1")).rejects.toBeInstanceOf(NoFreeSlotError);
  expect(sent.transfers).toBe(0);
});

test("a header with room lets the append through and counts it", async () => {
  const w = watchWith([]);
  const sent = acceptingWatch(w);

  await announce(w, [1, 4, 6, 7], [1, 2, 3, 4, 5, 6]); // §9.5h, after a factory reset
  await w.uploadWatchface(BIN, undefined, "rec1");
  expect(sent.transfers).toBe(1);
  expect(w.slots).toEqual({ used: 7, capacity: 7 });
  // the watch doesn't re-announce a055, so the next append has to hit the dialog on its own
  await expect(w.uploadWatchface(BIN, undefined, "rec2")).rejects.toBeInstanceOf(NoFreeSlotError);
});

test("without a header the merged list and the model's guess decide, as before", async () => {
  rememberDial(4242, "mine", undefined, SERIAL);
  const w = watchWith([1, 2, 3, 4, 5]); // no a055 seen: 5 listed + ours = WF_CAPACITY
  const sent = acceptingWatch(w);

  expect(w.slots).toEqual({ used: WF_CAPACITY, capacity: WF_CAPACITY });
  await expect(w.uploadWatchface(BIN, undefined, "rec1")).rejects.toBeInstanceOf(NoFreeSlotError);
  expect(sent.transfers).toBe(0);
});

test("a malformed header is ignored and the fallback stays", async () => {
  const w = watchWith([]);

  await announce(w, [1, 9, 7, 0], [1, 2]); // capacity 0 — not a reading to trust
  expect(w.slots).toEqual({ used: 2, capacity: WF_CAPACITY });
});

test("a Watch 3 Pro gets its own slot count, matched by the advertised name", () => {
  expect(capacityOf("CMF Watch 3 Pro-9A9D")).toBe(WF_CAPACITY_PRO3);
  expect(capacityOf("CMF Watch Pro 3-1A2B")).toBe(WF_CAPACITY_PRO3);
  expect(capacityOf("CMF Watch Pro 2-1A2B")).toBe(WF_CAPACITY);
  expect(capacityOf(null)).toBe(WF_CAPACITY);
});
