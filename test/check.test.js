import { test } from "node:test";
import assert from "node:assert/strict";

import { checkFile, detectType, extensionOf } from "../check.js";

// Tiny fake files, built byte by byte.
const bytes = (...parts) => new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const box = (type, payload = []) => bytes(u32(8 + payload.length), type, payload);
const join = (...arrays) => new Uint8Array(arrays.flatMap((a) => [...a]));

const ftyp = (brand) => box("ftyp", [...bytes(brand), 0, 0, 0, 0]);
const jpeg = (end = true) => bytes([0xff, 0xd8, 0xff, 0xe0], new Array(100).fill(7), end ? [0xff, 0xd9] : []);

function check(name, data) {
  return checkFile(name, data.length, async (offset, length) => data.subarray(offset, offset + length));
}

test("a whole JPEG is fine", async () => {
  assert.equal((await check("a.jpg", jpeg())).status, "ok");
});

test("a JPEG without its end marker was cut short", async () => {
  const r = await check("a.jpg", jpeg(false));
  assert.equal(r.status, "broken");
  assert.match(r.problem, /end marker/);
});

test("a JPEG named .MOV is a rename, not a broken file", async () => {
  const r = await check("IMG_0001.MOV", jpeg());
  assert.equal(r.status, "renamed");
  assert.equal(r.fixedName, "IMG_0001.jpg");
});

test("a whole MOV with its moov index is fine", async () => {
  const mov = join(ftyp("qt  "), box("wide"), box("mdat", new Array(50).fill(1)), box("moov", new Array(20).fill(2)));
  assert.equal((await check("clip.mov", mov)).status, "ok");
});

test("a MOV that stops inside its mdat box was cut short", async () => {
  const full = join(ftyp("qt  "), box("mdat", new Array(500).fill(1)), box("moov", new Array(20).fill(2)));
  const r = await check("clip.mov", full.subarray(0, 300));
  assert.equal(r.status, "broken");
  assert.match(r.problem, /'mdat' box needs/);
});

test("a MOV whose boxes are complete but has no moov cannot play", async () => {
  const r = await check("clip.mov", join(ftyp("qt  "), box("mdat", new Array(50).fill(1))));
  assert.equal(r.status, "broken");
  assert.match(r.problem, /moov/);
});

test("HEIC is detected from its brand, and a missing tail is caught", async () => {
  const heic = join(ftyp("heic"), box("meta", new Array(30).fill(3)), box("mdat", new Array(400).fill(4)));
  assert.equal((await check("IMG_0002.HEIC", heic)).status, "ok");
  assert.equal((await check("IMG_0002.HEIC", heic.subarray(0, 200))).status, "broken");
  assert.equal((await check("IMG_0002.JPG", heic)).status, "renamed");
});

test("64-bit box sizes are read", async () => {
  const big = bytes(u32(1), "mdat", u32(0), u32(16 + 10), new Array(10).fill(9));
  const mp4 = join(ftyp("isom"), big, box("moov"));
  assert.equal((await check("v.mp4", mp4)).status, "ok");
});

test("an empty or zero-filled file is broken", async () => {
  assert.equal((await check("x.jpg", new Uint8Array(0))).status, "broken");
  assert.equal((await check("x.jpg", new Uint8Array(64))).status, "broken");
});

test("extensions that mean the same format are treated as the same", () => {
  assert.equal(extensionOf("a.JPEG"), "jpg");
  assert.equal(extensionOf("a.heif"), "heic");
  assert.equal(extensionOf("a.DNG"), "tiff");
  assert.equal(detectType(bytes([0x89], "PNG", [13, 10, 26, 10])), "png");
});
