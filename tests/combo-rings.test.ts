// FMC-1: Combo's three rings are Move / Exercise / Stand (0x26 / 0x6c / 0x49), each on its own
// metric. They used to all read steps and moved together; this fails if any two share a metric
// again, or if a ring stops following the metric it is bound to.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parseBin } from "$lib/modules/editor/core/format";
import { fromLegacy, type Layer, type RingLayer } from "$lib/modules/editor/core/document/doc";
import {
  ID_METRIC,
  defaultSim,
  timeParts,
  type SimMetric,
} from "$lib/modules/editor/core/document/sources";
import { progressFrac } from "$lib/modules/editor/core/render/arc";

const face = parseBin(
  new Uint8Array(
    readFileSync(new URL("./__fixtures__/Multifunction__366__Combo.bin", import.meta.url)),
  ),
);
const rings: RingLayer[] = [];
const walk = (l: Layer) => {
  if (l.kind === "ring") rings.push(l);
  if (l.kind === "group") l.children.forEach(walk);
  if (l.kind === "raw") l.children?.forEach(walk);
};

fromLegacy(face).doc.screens.forEach((s) => s.layers.forEach(walk));

const goals = rings.filter((r) => [0x26, 0x6c, 0x49].includes(r.meta.source));

test("Combo binds its three goal rings to calories, exercise and stand hours", () => {
  expect(goals.map((r) => r.meta.source).sort((a, b) => a - b)).toEqual([0x26, 0x49, 0x6c]);
  expect(new Set(goals.map((r) => ID_METRIC[r.meta.source])).size).toBe(3);
});

test("each Combo ring moves with its own metric and only with it", () => {
  const sim = { ...defaultSim(), live: false };
  const t = timeParts(sim);
  const fill = (s: typeof sim) => goals.map((r) => progressFrac(r.meta.source, s, t, r.spec));
  const before = fill(sim);

  goals.forEach((ring, i) => {
    const metric = ID_METRIC[ring.meta.source] as SimMetric;
    const after = fill({ ...sim, [metric]: 0 });

    after.forEach((f, j) => (i === j ? expect(f).not.toBe(before[j]) : expect(f).toBe(before[j])));
  });
});
