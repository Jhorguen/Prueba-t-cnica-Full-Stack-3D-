'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { makeCloud } = require('../helpers');

let pts;
before(async () => { pts = await import('../../public/js/cloud/pts.js'); });

const toBytes = (buf) => new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

function parseInChunks(bytes, chunkSize, options) {
  const parser = pts.createPtsParser(options);
  for (let i = 0; i < bytes.length; i += chunkSize) parser.push(bytes.subarray(i, i + chunkSize));
  return parser.finish();
}

const xs = (cloud) => [...cloud.positions].filter((_, i) => i % 3 === 0);

test('parses positions and colors whatever the chunk size', () => {
  const bytes = toBytes(makeCloud(5));
  for (const size of [1, 3, 7, 16, 17, 64, bytes.length]) {
    const cloud = parseInChunks(bytes, size);
    assert.equal(cloud.count, 5);
    assert.equal(cloud.totalCount, 5);
    const slot = xs(cloud).indexOf(2);
    assert.deepEqual([...cloud.positions.subarray(slot * 3, slot * 3 + 3)], [2, 4, 6]);
    assert.deepEqual([...cloud.colors.subarray(slot * 3, slot * 3 + 3)], [10, 20, 30]);
    assert.ok(Math.abs(cloud.spacing - 0.02) < 1e-6);
  }
});

test('the first quarter of the output is an even sample of the whole cloud', () => {
  for (const points of [1, 2, 5, 8, 13, 100]) {
    const cloud = parseInChunks(toBytes(makeCloud(points)), 48);
    const order = xs(cloud);
    assert.deepEqual([...order].sort((a, b) => a - b), Array.from({ length: points }, (_, i) => i), `${points} points`);
    const preview = order.slice(0, cloud.previewCount);
    assert.equal(cloud.previewCount, Math.ceil(points / pts.PREVIEW_GROUPS));
    assert.deepEqual(preview, Array.from({ length: cloud.previewCount }, (_, i) => i * pts.PREVIEW_GROUPS));
  }
});

test('decimates evenly when the cloud has more points than allowed', () => {
  const cloud = parseInChunks(toBytes(makeCloud(10)), 32, { maxPoints: 4 });
  assert.equal(cloud.stride, 3);
  assert.equal(cloud.count, 4);
  assert.deepEqual(xs(cloud).sort((a, b) => a - b), [0, 3, 6, 9]);
});

test('a truncated body is reported, not silently accepted', () => {
  const full = toBytes(makeCloud(10));
  const cut = full.subarray(0, 16 + 6 * 16);
  assert.throws(() => parseInChunks(cut, 20), { name: 'PtsError', code: 'truncated', message: /6 of 10/ });
});

test('a record cut in half is reported as truncated', () => {
  const cut = toBytes(makeCloud(2)).subarray(0, 16 + 16 + 5);
  assert.throws(() => parseInChunks(cut, 64), { code: 'truncated' });
});

test('a file shorter than the header is reported as truncated', () => {
  assert.throws(() => parseInChunks(toBytes(makeCloud(1)).subarray(0, 10), 4), { code: 'truncated' });
  assert.throws(() => pts.createPtsParser().finish(), { code: 'truncated' });
});

test('a file with the wrong magic is rejected', () => {
  const bytes = toBytes(Buffer.from(makeCloud(1)));
  bytes[0] = 'X'.charCodeAt(0);
  assert.throws(() => parseInChunks(bytes, 64), { code: 'invalid_format' });
});

test('extra bytes after the announced points are rejected', () => {
  const bytes = toBytes(Buffer.concat([makeCloud(2), Buffer.alloc(16)]));
  assert.throws(() => parseInChunks(bytes, 64), { code: 'invalid_format' });
});

test('an empty cloud is valid', () => {
  const cloud = parseInChunks(toBytes(makeCloud(0)), 64);
  assert.equal(cloud.count, 0);
});
