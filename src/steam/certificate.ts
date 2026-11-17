// Decodes the "item certificate" of a CS2 item: the hex part of an inspect link
// (steam://run/730//+csgo_econ_action_preview%20<HEX>), also found in Steam's inventory JSON as asset property 6.
// The hex is a protobuf (CEconItemPreviewDataBlock) masked with a one-byte XOR key, followed by a 4-byte checksum.
// Old-style links (S...A...D...) carry no data and cannot be decoded here.

export type DecodedSticker = { slot: number; stickerId: number; wear: number | null };
export type DecodedItem = {
  defIndex: number | null;
  paintIndex: number | null;
  float: number | null;
  paintSeed: number | null;
  stickers: DecodedSticker[];
};

type Field = { no: number; wire: number; value: bigint; bytes: Uint8Array | null };

function readVarint(buf: Uint8Array, at: number): [bigint, number] | null {
  let result = 0n;
  let shift = 0n;
  for (let i = at; i < buf.length && i < at + 10; i++) {
    const byte = buf[i]!;
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return [result, i + 1];
    shift += 7n;
  }
  return null;
}

function parseFields(buf: Uint8Array): Field[] | null {
  const fields: Field[] = [];
  let at = 0;
  while (at < buf.length) {
    const key = readVarint(buf, at);
    if (!key) return null;
    at = key[1];
    const no = Number(key[0] >> 3n);
    const wire = Number(key[0] & 7n);
    if (wire === 0) {
      const v = readVarint(buf, at);
      if (!v) return null;
      fields.push({ no, wire, value: v[0], bytes: null });
      at = v[1];
    } else if (wire === 1) {
      if (at + 8 > buf.length) return null;
      at += 8;
    } else if (wire === 5) {
      if (at + 4 > buf.length) return null;
      const view = new DataView(buf.buffer, buf.byteOffset + at, 4);
      fields.push({ no, wire, value: BigInt(view.getUint32(0, true)), bytes: null });
      at += 4;
    } else if (wire === 2) {
      const len = readVarint(buf, at);
      if (!len) return null;
      const end = len[1] + Number(len[0]);
      if (end > buf.length) return null;
      fields.push({ no, wire, value: 0n, bytes: buf.subarray(len[1], end) });
      at = end;
    } else {
      return null;
    }
  }
  return fields;
}

const float32 = (bits: bigint): number => {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, Number(bits));
  return view.getFloat32(0);
};

export function inspectHex(input: string): string | null {
  let rest = input.trim();
  const marker = "csgo_econ_action_preview";
  const at = rest.lastIndexOf(marker);
  if (at >= 0) rest = rest.slice(at + marker.length).replace(/^(?:%20|\+|\s)+/, "");
  if (!/^[0-9A-Fa-f]{24,2000}$/.test(rest) || rest.length % 2 !== 0) return null;
  return rest.toUpperCase();
}

export function decodeCertificate(input: string): DecodedItem | null {
  const hex = inspectHex(input);
  if (!hex) return null;
  const raw = Uint8Array.from(Buffer.from(hex, "hex"));
  if (raw.length < 7) return null;
  const key = raw[0]!;
  const body = raw.map((b) => b ^ key).subarray(1, raw.length - 4);
  const fields = parseFields(body);
  if (!fields) return null;

  const num = (no: number) => fields.find((f) => f.no === no && f.wire === 0)?.value;
  const bits = fields.find((f) => f.no === 7 && (f.wire === 0 || f.wire === 5))?.value;
  const stickers: DecodedSticker[] = [];
  for (const f of fields) {
    if (f.no !== 12 || f.wire !== 2 || !f.bytes) continue;
    const inner = parseFields(f.bytes);
    if (!inner) continue;
    const wearBits = inner.find((x) => x.no === 3 && x.wire === 5)?.value;
    stickers.push({
      slot: Number(inner.find((x) => x.no === 1 && x.wire === 0)?.value ?? 0n),
      stickerId: Number(inner.find((x) => x.no === 2 && x.wire === 0)?.value ?? 0n),
      wear: wearBits === undefined ? null : float32(wearBits),
    });
  }
  const float = bits === undefined ? null : float32(bits);
  const item: DecodedItem = {
    defIndex: num(3) === undefined ? null : Number(num(3)),
    paintIndex: num(4) === undefined ? null : Number(num(4)),
    float: float !== null && Number.isFinite(float) && float >= 0 && float <= 1 ? float : null,
    paintSeed: num(8) === undefined ? null : Number(num(8)),
    stickers,
  };
  return item.defIndex === null && item.float === null ? null : item;
}
