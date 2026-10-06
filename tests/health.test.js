import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { connectDB, closeDB } from '../server/config/db.js';

describe('VoltGrid API Gateway Health Probes', () => {
  const app = createApp();

  before(async () => {
    await connectDB();
  });

  after(async () => {
    await closeDB();
  });

  test('GET /api/health returns HTTP 200 with healthy database and replica set', async () => {
    const res = await request(app).get('/api/health');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'ok');
    assert.strictEqual(res.body.service, 'VoltGrid EV Network API');
    assert.strictEqual(res.body.version, '1.0.0');
    assert.strictEqual(typeof res.body.uptimeSeconds, 'number');
    assert.strictEqual(res.body.database.connected, true);
    assert.strictEqual(res.body.database.replicaSet, 'rs0');
    assert.strictEqual(res.body.database.isWritablePrimary, true);
  });

  test('GET /api/nonexistent returns standardized 404 error structure', async () => {
    const res = await request(app).get('/api/nonexistent');

    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'NOT_FOUND');
  });

  test('GET / serves the client single-page application shell', async () => {
    const res = await request(app).get('/');

    assert.strictEqual(res.status, 200);
    assert.match(res.text, /VoltGrid/);
    assert.match(res.text, /id="router-view"/);
  });
});
