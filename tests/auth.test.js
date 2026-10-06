import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { connectDB, closeDB, getDB } from '../server/config/db.js';

describe('Phase 2: Authentication & API Core Integration Tests', () => {
  const app = createApp();
  let db;

  const testDriver = {
    name: 'Integration Test Driver',
    email: `test.driver.${Date.now()}@voltgrid.internal`,
    password: 'ValidPassword#2026',
    role: 'driver',
  };

  let authCookie = null;

  before(async () => {
    await connectDB();
    db = getDB();
  });

  after(async () => {
    if (db) {
      await db.collection('users').deleteOne({ email: testDriver.email.toLowerCase() });
    }
    await closeDB();
  });

  test('POST /api/auth/register creates user and sets httpOnly cookie', async () => {
    const res = await request(app).post('/api/auth/register').send(testDriver);

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.email, testDriver.email.toLowerCase());
    assert.strictEqual(res.body.data.role, 'driver');
    assert.strictEqual(res.body.data.walletBalance, 500);
    assert.strictEqual(
      res.body.data.passwordHash,
      undefined,
      'Password hash must never be returned'
    );

    // Verify cookie
    const cookies = res.headers['set-cookie'];
    assert.ok(cookies, 'Expected set-cookie header');
    const tokenCookie = cookies.find(c => c.startsWith('voltgrid_token='));
    assert.ok(tokenCookie, 'Expected voltgrid_token cookie');
    assert.match(tokenCookie, /HttpOnly/i);

    authCookie = tokenCookie.split(';')[0];
  });

  test('POST /api/auth/register rejects duplicate email registration', async () => {
    const res = await request(app).post('/api/auth/register').send(testDriver);

    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.success, false);
    assert.match(res.body.error.message, /already registered/i);
  });

  test('POST /api/auth/register validates payload schema (rejects short password)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Short Pass User',
      email: 'short.pass@voltgrid.internal',
      password: 'short', // less than 8 chars
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
  });

  test('POST /api/auth/login succeeds with valid credentials and sets cookie', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: testDriver.email,
      password: testDriver.password,
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.email, testDriver.email.toLowerCase());

    const cookies = res.headers['set-cookie'];
    assert.ok(cookies);
    const tokenCookie = cookies.find(c => c.startsWith('voltgrid_token='));
    assert.ok(tokenCookie);
    authCookie = tokenCookie.split(';')[0];
  });

  test('POST /api/auth/login rejects incorrect password', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: testDriver.email,
      password: 'WrongPassword#9999',
    });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
    assert.match(res.body.error.message, /invalid email or password/i);
  });

  test('GET /api/auth/me returns authenticated user details', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', authCookie);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.email, testDriver.email.toLowerCase());
    assert.strictEqual(res.body.data.role, 'driver');
  });

  test('GET /api/auth/me rejects unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/auth/me');

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
  });

  test('POST /api/auth/change-password updates user password', async () => {
    const newPassword = 'NewSecretPassword#2026';
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', authCookie)
      .send({
        currentPassword: testDriver.password,
        newPassword,
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);

    // Verify login with new password
    const loginRes = await request(app).post('/api/auth/login').send({
      email: testDriver.email,
      password: newPassword,
    });

    assert.strictEqual(loginRes.status, 200);
  });

  test('POST /api/auth/logout clears authentication cookie', async () => {
    const res = await request(app).post('/api/auth/logout').set('Cookie', authCookie);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);

    const cookies = res.headers['set-cookie'];
    assert.ok(cookies);
    const clearedCookie = cookies.find(c => c.startsWith('voltgrid_token=;'));
    assert.ok(clearedCookie, 'Expected cleared voltgrid_token cookie');
  });
});
