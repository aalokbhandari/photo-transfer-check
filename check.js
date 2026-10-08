// Checks one photo or video file: what it really is, and whether it is whole.
// Works in the browser (File) and in Node (see test/), because it only needs two things:
// the file size and a way to read some bytes at an offset.

const ISO_BRANDS = {
  heic: ["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"],
  mov: ["qt  "],
  mp4: ["isom", "iso2", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "M4V ", "M4A ", "dash", "3gp4", "3gp5", "3g2a"],
};

const SAME = { jpeg: "jpg", tif: "tiff", dng: "tiff", heif: "heic", hif: "heic", qt: "mov", m4v: "mp4", "3gp": "mp4" };

function ascii(bytes, start, length) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function u32(bytes, at) {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}

// What the first bytes say the file is.
export function detectType(head) {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpg";
  if (head.length >= 8 && ascii(head, 1, 3) === "PNG") return "png";
  if (head.length >= 12 && ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 4) === "WEBP") return "webp";
  if (head.length >= 6 && ascii(head, 0, 3) === "GIF") return "gif";
  if (head.length >= 4 && ((head[0] === 0x49 && head[1] === 0x49 && head[2] === 0x2a) || (head[0] === 0x4d && head[1] === 0x4d && head[3] === 0x2a))) return "tiff";
  if (head.length >= 12 && ascii(head, 4, 4) === "ftyp") {
    const brand = ascii(head, 8, 4);
    for (const [type, brands] of Object.entries(ISO_BRANDS)) {
      if (brands.includes(brand)) return type;
    }
    return "mp4";
  }
  if (head.length > 0 && head.every((b) => b === 0)) return "empty";
  return "unknown";
}

export function extensionOf(name) {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "";
  const ext = name.slice(dot + 1).toLowerCase();
  return SAME[ext] || ext;
}

// Walks the top-level boxes of a HEIC/MOV/MP4 file. A box that claims more bytes than
// are left in the file means the file was cut short.
async function checkIsoBoxes(size, read, type) {
  const seen = [];
  let offset = 0;
  while (offset < size) {
    if (size - offset < 8) return { ok: false, problem: `file ends in the middle of a box header at byte ${offset}` };
    const header = await read(offset, 16);
    let boxSize = u32(header, 0);
    const boxType = ascii(header, 4, 4);
    if (boxSize === 1) {
      boxSize = u32(header, 8) * 2 ** 32 + u32(header, 12);
    } else if (boxSize === 0) {
      boxSize = size - offset;
    }
    if (boxSize < 8) return { ok: false, problem: `broken box '${boxType}' at byte ${offset}` };
    seen.push(boxType);
    if (offset + boxSize > size) {
      const missing = offset + boxSize - size;
      return { ok: false, problem: `cut short: the '${boxType}' box needs ${missing.toLocaleString("en-US")} more bytes than the file has`, boxes: seen };
    }
    offset += boxSize;
  }
  if ((type === "mov" || type === "mp4") && !seen.includes("moov")) {
    return { ok: false, problem: "no 'moov' index, so players cannot find the frames", boxes: seen };
  }
  if (type === "heic" && !seen.includes("meta")) {
    return { ok: false, problem: "no 'meta' box, so the photo layout is missing", boxes: seen };
  }
  return { ok: true, boxes: seen };
}

// A JPEG ends with FF D9. Some cameras pad the end, so look in the last 4 KB.
async function checkJpegEnd(size, read) {
  const length = Math.min(size, 4096);
  const tail = await read(size - length, length);
  for (let i = tail.length - 2; i >= 0; i--) {
    if (tail[i] === 0xff && tail[i + 1] === 0xd9) return { ok: true };
  }
  return { ok: false, problem: "cut short: the JPEG end marker is missing" };
}

async function checkPngEnd(size, read) {
  const length = Math.min(size, 64);
  const tail = await read(size - length, length);
  return ascii(tail, 0, tail.length).includes("IEND") ? { ok: true } : { ok: false, problem: "cut short: the PNG end chunk is missing" };
}

// name: file name, size: bytes, read(offset, length) -> Promise<Uint8Array>
export async function checkFile(name, size, read) {
  const ext = extensionOf(name);
  if (size === 0) return { name, ext, type: "empty", status: "broken", problem: "the file is empty (0 bytes)" };

  const head = await read(0, Math.min(size, 16));
  const type = detectType(head);
  const result = { name, ext, type, size };

  if (type === "empty") return { ...result, status: "broken", problem: "the file starts with zeros, no real data" };
  if (type === "unknown") return { ...result, status: "unknown", problem: "not a photo or video format this tool knows" };

  let whole = { ok: true };
  if (type === "heic" || type === "mov" || type === "mp4") whole = await checkIsoBoxes(size, read, type);
  else if (type === "jpg") whole = await checkJpegEnd(size, read);
  else if (type === "png") whole = await checkPngEnd(size, read);

  if (!whole.ok) return { ...result, status: "broken", problem: whole.problem };
  if (ext !== type) return { ...result, status: "renamed", problem: `named .${ext || "(none)"} but it is really a ${type.toUpperCase()}`, fixedName: name.replace(/\.[^.]*$/, "") + "." + type };
  return { ...result, status: "ok" };
}

export const MEDIA_EXTENSIONS = ["jpg", "jpeg", "png", "heic", "heif", "hif", "mov", "mp4", "m4v", "3gp", "gif", "webp", "dng", "tif", "tiff"];
