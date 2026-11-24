export const HEADER_BYTES = 16;
export const RECORD_BYTES = 16;
const MAGIC = 'PTS1';

export class PtsError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PtsError';
    this.code = code;
  }
}

const formatCount = (n) => n.toLocaleString('en-US');

export function parseHeader(bytes) {
  if (bytes.byteLength < HEADER_BYTES) {
    throw new PtsError('truncated', 'The point cloud file ends before its header is complete.');
  }
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== MAGIC) {
    throw new PtsError('invalid_format', 'This file is not a PTS1 point cloud.');
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

  function startBody() {
    header = parseHeader(headerBytes);
    stride = Math.max(1, Math.ceil(header.count / maxPoints));
    const capacity = Math.ceil(header.count / stride);
    positions = new Float32Array(capacity * 3);
    colors = new Uint8Array(capacity * 3);
  }

  function readRecord(view, offset) {
    if (recordIndex >= header.count) {
      throw new PtsError('invalid_format', 'The file holds more points than its header announces.');
    }
    if (recordIndex % stride === 0) {
      const i = kept * 3;
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
      throw new PtsError('truncated', 'The point cloud file ends before its header is complete.');
    }
    if (recordIndex < header.count || carryFill > 0) {
      throw new PtsError(
        'truncated',
        `The point cloud file is incomplete: only ${formatCount(recordIndex)} of ${formatCount(header.count)} points arrived.`,
      );
    }
    return {
      positions,
      colors,
      count: kept,
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
