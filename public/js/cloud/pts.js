export const HEADER_BYTES = 16;
export const RECORD_BYTES = 16;
export const PREVIEW_GROUPS = 4;
const MAGIC = 'PTS1';

export class PtsError extends Error {
  constructor(code, message, params = {}) {
    super(message);
    this.name = 'PtsError';
    this.code = code;
    this.params = params;
  }
}

const formatCount = (n) => n.toLocaleString('en-US');

export function parseHeader(bytes) {
  if (bytes.byteLength < HEADER_BYTES) {
    throw new PtsError('truncated', 'The point cloud file ends before its header is complete.', { reason: 'header' });
  }
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== MAGIC) {
    throw new PtsError('invalid_format', 'This file is not a PTS1 point cloud.', { reason: 'magic' });
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, HEADER_BYTES);
  const count = view.getUint32(4, true);
  return {
    count,
    spacing: view.getFloat32(8, true),
    byteLength: HEADER_BYTES + count * RECORD_BYTES,
  };
}

export function createPtsParser({ maxPoints = Infinity } = {}) {
  const headerBytes = new Uint8Array(HEADER_BYTES);
  const carry = new Uint8Array(RECORD_BYTES);
  const carryView = new DataView(carry.buffer);
  let headerFill = 0;
  let carryFill = 0;
  let header = null;
  let stride = 1;
  let positions = null;
  let colors = null;
  let recordIndex = 0;
  let kept = 0;
  let received = 0;
  let groupOffsets = [];
  let previewCount = 0;

  function startBody() {
    header = parseHeader(headerBytes);
    stride = Math.max(1, Math.ceil(header.count / maxPoints));
    const capacity = Math.ceil(header.count / stride);
    positions = new Float32Array(capacity * 3);
    colors = new Uint8Array(capacity * 3);
    const groupSizes = Array.from({ length: PREVIEW_GROUPS }, (_, g) => (
      g < capacity ? Math.floor((capacity - 1 - g) / PREVIEW_GROUPS) + 1 : 0
    ));
    groupOffsets = groupSizes.map((_, g) => groupSizes.slice(0, g).reduce((a, b) => a + b, 0));
    previewCount = groupSizes[0];
  }

  function slotFor(index) {
    return groupOffsets[index % PREVIEW_GROUPS] + Math.floor(index / PREVIEW_GROUPS);
  }

  function readRecord(view, offset) {
    if (recordIndex >= header.count) {
      throw new PtsError('invalid_format', 'The file holds more points than its header announces.', { reason: 'extra' });
    }
    if (recordIndex % stride === 0) {
      const i = slotFor(kept) * 3;
      positions[i] = view.getFloat32(offset, true);
      positions[i + 1] = view.getFloat32(offset + 4, true);
      positions[i + 2] = view.getFloat32(offset + 8, true);
      colors[i] = view.getUint8(offset + 12);
      colors[i + 1] = view.getUint8(offset + 13);
      colors[i + 2] = view.getUint8(offset + 14);
      kept++;
    }
    recordIndex++;
  }

  function push(chunk) {
    received += chunk.byteLength;
    let offset = 0;

    if (!header) {
      const take = Math.min(HEADER_BYTES - headerFill, chunk.byteLength);
      headerBytes.set(chunk.subarray(0, take), headerFill);
      headerFill += take;
      offset = take;
      if (headerFill < HEADER_BYTES) return;
      startBody();
    }

    if (carryFill > 0) {
      const take = Math.min(RECORD_BYTES - carryFill, chunk.byteLength - offset);
      carry.set(chunk.subarray(offset, offset + take), carryFill);
      carryFill += take;
      offset += take;
      if (carryFill < RECORD_BYTES) return;
      readRecord(carryView, 0);
      carryFill = 0;
    }

    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    const end = offset + Math.floor((chunk.byteLength - offset) / RECORD_BYTES) * RECORD_BYTES;
    for (; offset < end; offset += RECORD_BYTES) readRecord(view, offset);

    if (offset < chunk.byteLength) {
      carry.set(chunk.subarray(offset), 0);
      carryFill = chunk.byteLength - offset;
    }
  }

  function finish() {
    if (!header) {
      throw new PtsError('truncated', 'The point cloud file ends before its header is complete.', { reason: 'header' });
    }
    if (recordIndex < header.count || carryFill > 0) {
      throw new PtsError(
        'truncated',
        `The point cloud file is incomplete: only ${formatCount(recordIndex)} of ${formatCount(header.count)} points arrived.`,
        { reason: 'points', received: recordIndex, total: header.count },
      );
    }
    return {
      positions,
      colors,
      count: kept,
      previewCount,
      totalCount: header.count,
      stride,
      spacing: header.spacing,
    };
  }

  return {
    push,
    finish,
    get header() { return header; },
    get received() { return received; },
  };
}
