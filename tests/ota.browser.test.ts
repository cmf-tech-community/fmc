// Firmware updates: the image gate (ota-image.ts) and the transfer (Watch.flashFirmware).
// The gate is what stands between a watch and a file it might not survive, so it's tested on
// both sides — a well-formed image passes, and each single thing wrong with one is refused. The
// transfer is played against a scripted watch that answers the way a real one did in the
// cmf-watch-utils logs, and checks the one thing that bricks or reboots a watch when it's
// wrong: which command goes to which characteristic, in which order.
import { expect, test } from "vitest";
import { Watch } from "$lib/modules/device/lib/ble";
import { CMD, Codec, crc32, UUID } from "$lib/modules/device/lib/ble-protocol";
import {
  BOARDS,
  checkOtaTarget,
  inspectOtaImage,
  OTA_BOARD,
} from "$lib/modules/device/lib/ota-image";

// ---- a minimal, valid image: ota.xml + TEMP.bin + an AGPS trailer ----
const le32 = (d: Uint8Array, off: number, v: number) =>
  new DataView(d.buffer).setUint32(off, v >>> 0, true);
const align = (n: number) => Math.ceil(n / 0x200) * 0x200;
const ascii = (d: Uint8Array, off: number, s: string) => d.set(new TextEncoder().encode(s), off);

function buildImage({ board = OTA_BOARD, trailer = true } = {}) {
  const temp = new Uint8Array(3000).map((_, i) => (i * 7) & 0xff);
  const xml = new TextEncoder().encode(
    `<ota_firmware><firmware_version><version_code>0x10002</version_code>` +
      `<board_name>${board}</board_name></firmware_version><partitions>` +
      `<partition><file_name>TEMP.bin</file_name><file_size>0x${temp.length.toString(16)}</file_size></partition>` +
      `</partitions></ota_firmware>`,
  );
  const tempOff = align(0x400 + xml.length);
  const end = align(tempOff + temp.length);
  const agps = new Uint8Array(trailer ? 64 : 0);

  if (trailer) {
    ascii(agps, 0, "AGPS");
    new DataView(agps.buffer).setBigUint64(8, BigInt(agps.length - 24), true);
  }
  const d = new Uint8Array(end + agps.length);

  ascii(d, 0, "AOTA");
  le32(d, 0x0c, 2);
  new DataView(d.buffer).setUint16(0x12, 0x400, true);
  le32(d, 0x14, end);
  ascii(d, 0x40, "1.00_test");
  ascii(d, 0x60, board);
  d.set(xml, 0x400);
  d.set(temp, tempOff);
  d.set(agps, end);
  for (const [i, name, off, size] of [
    [0, "ota.xml", 0x400, xml.length],
    [1, "TEMP.bin", tempOff, temp.length],
  ] as const) {
    const o = 0x200 + i * 32;

    ascii(d, o, name);
    le32(d, o + 16, off);
    le32(d, o + 20, size);
    le32(d, o + 28, crc32(d.subarray(off, off + size)));
  }
  le32(d, 0x18, crc32(d.subarray(0x400, end)));
  le32(d, 0x04, crc32(d.subarray(8, 0x400)));
  return d;
}
// re-seal the header after poking a byte in it, so only the poked thing is wrong
const reseal = (d: Uint8Array) => (le32(d, 0x04, crc32(d.subarray(8, 0x400))), d);

test("a well-formed image passes and reports what it carries", () => {
  const info = inspectOtaImage(buildImage());

  expect(info.board).toBe(OTA_BOARD);
  expect(info.version).toBe("1.00_test");
  expect(info.versionCode).toBe(0x10002);
  expect(info.partitions.map((p) => p.name)).toEqual(["TEMP.bin"]);
});

test.each([
  ["a flipped payload byte", (d: Uint8Array) => ((d[0x900] ^= 1), d), /checksum/],
  ["a flipped header byte", (d: Uint8Array) => ((d[0x41] ^= 1), d), /header checksum/],
  ["a stale data checksum", (d: Uint8Array) => reseal((le32(d, 0x18, 0), d)), /data checksum/],
  ["no AOTA magic", (d: Uint8Array) => ((d[0] = 0), d), /magic/],
  ["a truncated file", (d: Uint8Array) => d.subarray(0, 0x300), /too small/],
] as const)("refuses %s", (_, spoil, why) => {
  expect(() => inspectOtaImage(spoil(buildImage()))).toThrow(why);
});

test("refuses an image for a board no known watch has", () => {
  expect(() => inspectOtaImage(buildImage({ board: "jx999_01_0000x" }))).toThrow(
    /board "jx999_01_0000x", which no known watch has/,
  );
});

// ---- the board gate: image vs the watch on the line vs the record being flashed ----
const WP2 = "CMF Watch Pro 2-9A9D";
const WP3 = "CMF Watch 3 Pro-1B2C";
const wp2Image = () => buildImage({ board: BOARDS.watch_pro_2.board });
const wp3Image = () => buildImage({ board: BOARDS.watch_3_pro.board });

test("a Watch Pro 2 image goes to a Watch Pro 2, from its record or an untagged one", () => {
  expect(checkOtaTarget(wp2Image(), WP2, "watch_pro_2").board).toBe("jx402_01_3089c");
  expect(checkOtaTarget(wp2Image(), WP2, "").board).toBe("jx402_01_3089c");
});

test.each([
  ["a Watch 3 Pro image on a Watch Pro 2", wp3Image, WP2, "watch_pro_2", /"jx402_08".*Watch Pro 2/],
  ["a Watch 3 Pro image on an untagged record", wp3Image, WP2, "", /"jx402_08".*Watch Pro 2/],
  [
    "a Watch Pro 2 image on a Watch 3 Pro",
    wp2Image,
    WP3,
    "watch_pro_2",
    /“CMF Watch 3 Pro-1B2C” is a CMF Watch 3 Pro \(board "jx402_08"\)/,
  ],
  [
    "a watch_3_pro record holding a Watch Pro 2 image",
    wp2Image,
    WP2,
    "watch_3_pro",
    /"jx402_01_3089c".*record is for the CMF Watch 3 Pro \(board "jx402_08"\)/,
  ],
  [
    "a Watch 3 Pro image on a Watch 3 Pro: no OTA path for it",
    wp3Image,
    WP3,
    "watch_3_pro",
    /Watch Pro 2 only/,
  ],
  [
    "a watch with no known board",
    wp2Image,
    "CMF Watch Pro-0001",
    "watch_pro_2",
    /“CMF Watch Pro-0001” isn't a watch with a known board/,
  ],
  ["a nameless watch", wp2Image, null, "watch_pro_2", /known board/],
  [
    "a record for a watch with no known board",
    wp2Image,
    WP2,
    "watch_pro",
    /CMF Watch Pro, a watch with no known board/,
  ],
  [
    "an unknown board",
    () => buildImage({ board: "jx999_01_0000x" }),
    WP2,
    "watch_pro_2",
    /jx999_01_0000x/,
  ],
] as const)("refuses %s", (_, image, watch, device, why) => {
  expect(() => checkOtaTarget(image(), watch, device)).toThrow(why);
});

test("refuses an emulator-only image without the AGPS trailer", () => {
  expect(() => inspectOtaImage(buildImage({ trailer: false }))).toThrow(/AGPS/);
});

// ---- the transfer against a scripted watch ----
const KEY = new Uint8Array(16).fill(7);

async function scriptedWatch(image: Uint8Array, verdict = 1) {
  const w = new Watch();
  const peer = new Codec(); // the watch's side of the session

  await w.codec.setKey(KEY);
  await peer.setKey(KEY);
  const traffic: [string, string][] = [];
  const served: Uint8Array[] = [];
  const say = async (key: number, payload: Uint8Array, on = UUID.otaRead) => {
    for (const f of await peer.encode(key, payload)) await w.onNotify(on, f);
  };
  const ranges: [number, number][] = [
    [0x400, 600],
    [0, 300], // out of order, as a real watch asks
    [image.length - 64, 64],
  ];
  const range = (off: number, len: number) => {
    const p = new Uint8Array(9);

    new DataView(p.buffer).setUint32(0, off);
    new DataView(p.buffer).setUint32(4, len);
    p[8] = 50;
    return p;
  };
  let left = 0;
  const pending: Uint8Array[] = [];
  const concat = (parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));

    parts.reduce((at, p) => (out.set(p, at), at + p.length), 0);
    return out;
  };
  const char = (uuid: string) =>
    ({
      writeValueWithoutResponse: async (f: Uint8Array) => {
        const frame = new Uint8Array(f);
        const dv = new DataView(frame.buffer);
        let key: number | undefined, payload: Uint8Array | undefined;

        // a data frame is plaintext with its own CRC32 tail — check it and keep the bytes; the
        // range is complete on its last frame
        if (dv.getUint16(9) === (CMD.otaChunkWrite & 0xffff)) {
          const body = frame.slice(11, -4);

          expect(dv.getUint32(frame.length - 4, true)).toBe(crc32(body));
          expect(frame.length).toBeLessThanOrEqual(11 + 224 + 4);
          pending.push(body);
          if (dv.getUint16(7) !== dv.getUint16(5)) return;
          [key, payload] = [CMD.otaChunkWrite, concat(pending.splice(0))];
        } else ({ key, payload } = (await peer.decode(frame)) ?? {});
        const name = Object.entries(CMD).find(([, v]) => v === key)?.[0] ?? "?";

        if (key === undefined) return;
        traffic.push([uuid === UUID.otaWrite ? "ota" : "cmd", name]);
        // answer asynchronously, the way a notification arrives
        setTimeout(async () => {
          if (key === CMD.otaBeginReq)
            await say(CMD.otaBeginRep, new Uint8Array([1]), UUID.cmdRead);
          if (key === CMD.otaStartReq) {
            await say(CMD.otaStartRep, new Uint8Array([1]));
            left = ranges.length;
            await say(CMD.otaChunkReq, range(...ranges[0]));
          }
          if (key === CMD.otaChunkWrite) {
            served.push(payload!);
            const next = ranges.length - --left;

            if (left > 0) await say(CMD.otaChunkReq, range(...ranges[next]));
            else await say(CMD.otaVerdict, new Uint8Array([verdict]));
          }
        });
      },
      writeValueWithResponse: async () => {},
    }) as unknown as BluetoothRemoteGATTCharacteristic;

  w.chars[UUID.cmdWrite] = char(UUID.cmdWrite);
  w.chars[UUID.otaWrite] = char(UUID.otaWrite);
  w.chars[UUID.otaRead] = char(UUID.otaRead);
  return { w, traffic, served, ranges };
}

test("a flash sends each command on its own characteristic and commits on the verdict", async () => {
  const image = buildImage();
  const { w, traffic, served, ranges } = await scriptedWatch(image);
  const progress: number[] = [];

  await w.flashFirmware(image, (p) => progress.push(p));
  // 0x9040 on the command characteristic is what reboots a watch — it must go to ff01
  expect(traffic).toEqual([
    ["cmd", "otaBeginReq"],
    ["ota", "otaStartReq"],
    ["ota", "otaChunkWrite"],
    ["ota", "otaChunkWrite"],
    ["ota", "otaChunkWrite"],
    ["cmd", "otaCommit"],
  ]);
  // exactly the bytes asked for, in the order asked
  expect(served).toEqual(ranges.map(([off, len]) => image.slice(off, off + len)));
  expect(progress.at(-1)).toBe(100);
});

test("a rejected image still gets the commit and surfaces the refusal", async () => {
  const image = buildImage();
  const { w, traffic } = await scriptedWatch(image, 2);

  await expect(w.flashFirmware(image)).rejects.toThrow(/rejected the image \(02\)/);
  expect(traffic.at(-1)).toEqual(["cmd", "otaCommit"]);
});

test("no firmware-update channel, no flash — and nothing is sent", async () => {
  const w = new Watch();
  let sent = 0;

  w.send = async () => void sent++;
  await expect(w.flashFirmware(buildImage())).rejects.toThrow(/firmware-update channel/);
  expect(sent).toBe(0);
});
