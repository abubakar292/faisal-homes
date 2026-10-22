import { InMemorySecurityStore, setSecurityStore } from '../api/opening/_store.js';
import statusHandler from '../api/opening/status.js';
import setupHandler from '../api/opening/setup.js';
import verifyHandler from '../api/opening/verify.js';
import checkTokenHandler from '../api/opening/check-token.js';
import changeHandler from '../api/opening/change.js';
import { verifyToken, createToken } from '../api/opening/_crypto.js';

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  data: any;
}

function createMockReqRes(method: string, body?: any, headers?: Record<string, string>) {
  const normalizedHeaders: Record<string, string> = {};
  if (headers) {
    for (const [k, v] of Object.entries(headers)) {
      normalizedHeaders[k.toLowerCase()] = v;
    }
  }

  const req: any = {
    method,
    body: body !== undefined ? body : {},
    headers: normalizedHeaders,
  };

  const mockRes: MockResponse = {
    statusCode: 200,
    headers: {},
    data: null,
  };

  const res: any = {
    get statusCode() {
      return mockRes.statusCode;
    },
    set statusCode(code: number) {
      mockRes.statusCode = code;
    },
    setHeader(key: string, val: string) {
      mockRes.headers[key.toLowerCase()] = String(val);
    },
    end(content?: string) {
      if (content !== undefined) {
        try {
          mockRes.data = JSON.parse(content);
        } catch {
          mockRes.data = content;
        }
      }
    },
  };

  return { req, res, mockRes };
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function containsHashOrSalt(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false;
  for (const [k, v] of Object.entries(obj)) {
    if (k.toLowerCase().includes('hash') || k.toLowerCase().includes('salt')) {
      return true;
    }
    if (typeof v === 'object' && containsHashOrSalt(v)) {
      return true;
    }
  }
  return false;
}

async function runTests() {
  console.log('--- FAISAL HOMES OPENING PASSWORD TEST SUITE ---');
  let passedCount = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passedCount++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}: ${err.message}`);
      process.exitCode = 1;
    }
  }

  const memStore = new InMemorySecurityStore();
  setSecurityStore(memStore);

  // 1. Initial status check
  await test('Initial status is unconfigured', async () => {
    const { req, res, mockRes } = createMockReqRes('GET');
    await statusHandler(req, res);
    assert(mockRes.statusCode === 200, 'Status code should be 200');
    assert(mockRes.data.configured === false, 'configured should be false');
    assert(mockRes.headers['cache-control'] === 'no-store', 'Cache-control must be no-store');
  });

  // 2. Setup rejects non-4-digit input
  await test('Setup rejects non-4-digit input', async () => {
    const cases = ['123', '12345', 'abcd', '12a4', ''];
    for (const pin of cases) {
      const { req, res, mockRes } = createMockReqRes('POST', { pin, confirm: pin });
      await setupHandler(req, res);
      assert(mockRes.statusCode === 400, `Expected 400 for PIN "${pin}"`);
      assert(mockRes.data.ok === false, 'ok should be false');
      assert(!containsHashOrSalt(mockRes.data), 'Never leak hash/salt');
    }
  });

  // 3. Setup rejects mismatched confirm
  await test('Setup rejects wrong confirm', async () => {
    const { req, res, mockRes } = createMockReqRes('POST', { pin: '1234', confirm: '5678' });
    await setupHandler(req, res);
    assert(mockRes.statusCode === 400, 'Expected 400 for mismatch');
    assert(mockRes.data.ok === false, 'ok should be false');
    assert(mockRes.data.error.includes('match'), 'Error message should mention match');
    assert(!containsHashOrSalt(mockRes.data), 'Never leak hash/salt');
  });

  // 4. Setup works once
  await test('Setup works once', async () => {
    const { req, res, mockRes } = createMockReqRes('POST', { pin: '4321', confirm: '4321' });
    await setupHandler(req, res);
    assert(mockRes.statusCode === 200, 'Expected 200 on setup success');
    assert(mockRes.data.ok === true, 'ok should be true');
    assert(!containsHashOrSalt(mockRes.data), 'Never leak hash/salt');

    // Verify status is now configured
    const status = createMockReqRes('GET');
    await statusHandler(status.req, status.res);
    assert(status.mockRes.data.configured === true, 'configured should be true');
  });

  // 5. A second setup is rejected
  await test('A second setup is rejected', async () => {
    const { req, res, mockRes } = createMockReqRes('POST', { pin: '9999', confirm: '9999' });
    await setupHandler(req, res);
    assert(mockRes.statusCode === 409, 'Expected 409 conflict on second setup');
    assert(mockRes.data.ok === false, 'ok should be false');
    assert(!containsHashOrSalt(mockRes.data), 'Never leak hash/salt');
  });

  // 6. Verify non-4-digit input rejected
  await test('Verify rejects non-4-digit input', async () => {
    for (const badPin of ['1', '12', '123', '12345', '12e4']) {
      const { req, res, mockRes } = createMockReqRes('POST', { pin: badPin });
      await verifyHandler(req, res);
      assert(mockRes.statusCode === 400, `Expected 400 for invalid pin length ${badPin}`);
      assert(mockRes.data.ok === false, 'ok should be false');
      assert(!containsHashOrSalt(mockRes.data), 'Never leak hash/salt');
    }
  });

  // 7. Correct PIN returns token and token validates
  let validToken = '';
  await test('Correct PIN returns token and validates', async () => {
    const { req, res, mockRes } = createMockReqRes('POST', { pin: '4321' });
    await verifyHandler(req, res);
    assert(mockRes.statusCode === 200, 'Expected 200 for correct PIN');
    assert(mockRes.data.ok === true, 'ok should be true');
    assert(typeof mockRes.data.token === 'string', 'Token should be returned');
    assert(typeof mockRes.data.exp === 'number', 'Token exp should be returned');
    assert(!containsHashOrSalt(mockRes.data), 'Never leak hash/salt');

    validToken = mockRes.data.token;

    // Check token with /api/opening/check-token
    const check1 = createMockReqRes('POST', { token: validToken });
    await checkTokenHandler(check1.req, check1.res);
    assert(check1.mockRes.data.valid === true, 'Token must be valid');

    // Check token via Authorization header
    const check2 = createMockReqRes('POST', {}, { authorization: `Bearer ${validToken}` });
    await checkTokenHandler(check2.req, check2.res);
    assert(check2.mockRes.data.valid === true, 'Token via Authorization header must be valid');
  });

  // 8. Tampered or expired token rejected
  await test('Tampered or expired token rejected', async () => {
    // Tampered token
    const tampered = validToken.slice(0, -4) + 'abcd';
    const checkTampered = createMockReqRes('POST', { token: tampered });
    await checkTokenHandler(checkTampered.req, checkTampered.res);
    assert(checkTampered.mockRes.data.valid === false, 'Tampered token must be rejected');

    // Expired token
    const expiredPayload = Buffer.from(JSON.stringify({ exp: Date.now() - 10000, nonce: 'old' })).toString('base64url');
    const { token: freshToken } = createToken();
    const secretSignature = freshToken.split('.')[1];
    const expiredToken = `${expiredPayload}.${secretSignature}`;
    const checkExpired = createMockReqRes('POST', { token: expiredToken });
    await checkTokenHandler(checkExpired.req, checkExpired.res);
    assert(checkExpired.mockRes.data.valid === false, 'Expired token must be rejected');
  });

  // 9. Rate limiting: 5 wrong PINs lock, correct PIN also rejected while locked
  await test('5 wrong PINs lock, correct PIN also rejected while locked', async () => {
    // 4 wrong attempts
    for (let i = 1; i <= 4; i++) {
      const { req, res, mockRes } = createMockReqRes('POST', { pin: '0000' });
      await verifyHandler(req, res);
      assert(mockRes.statusCode === 401, `Attempt ${i} should return 401`);
      assert(mockRes.data.ok === false, 'ok should be false');
      assert(mockRes.data.remainingAttempts === 5 - i, `Remaining attempts should be ${5 - i}`);
      assert(!containsHashOrSalt(mockRes.data), 'Never leak hash/salt');
    }

    // 5th wrong attempt triggers lockout
    const { req: req5, res: res5, mockRes: mockRes5 } = createMockReqRes('POST', { pin: '0000' });
    await verifyHandler(req5, res5);
    assert(mockRes5.statusCode === 429, '5th attempt must return 429');
    assert(mockRes5.data.ok === false, 'ok should be false');
    assert(typeof mockRes5.data.lockedUntilMs === 'number', 'Must return lockedUntilMs');
    assert(mockRes5.data.lockedUntilMs > Date.now(), 'lockedUntilMs must be in the future');
    assert(!containsHashOrSalt(mockRes5.data), 'Never leak hash/salt');

    const firstLockTime = mockRes5.data.lockedUntilMs;

    // While locked, even the CORRECT PIN must be rejected!
    const { req: reqCorrect, res: resCorrect, mockRes: mockResCorrect } = createMockReqRes('POST', { pin: '4321' });
    await verifyHandler(reqCorrect, resCorrect);
    assert(mockResCorrect.statusCode === 429, 'Correct PIN must also be rejected while locked');
    assert(mockResCorrect.data.ok === false, 'ok should be false');
    assert(mockResCorrect.data.lockedUntilMs === firstLockTime, 'Lock time should be unchanged');
  });

  // 10. Lock doubles on the next round
  await test('Lock doubles on the next round', async () => {
    const record = await memStore.get();
    assert(record !== null, 'Record should exist');

    // Simulate lockout expiry by advancing lockedUntil to the past
    record.lockedUntil = Date.now() - 1000;
    await memStore.update(record);

    // Now fail 5 more times in the next round
    for (let i = 1; i <= 4; i++) {
      const { req, res } = createMockReqRes('POST', { pin: '0000' });
      await verifyHandler(req, res);
    }

    const { req: req5, res: res5, mockRes: mockRes5 } = createMockReqRes('POST', { pin: '0000' });
    await verifyHandler(req5, res5);
    assert(mockRes5.statusCode === 429, '5th attempt in round 2 must return 429');
    assert(typeof mockRes5.data.lockedUntilMs === 'number', 'lockedUntilMs present');

    const updatedRecord = await memStore.get();
    assert(updatedRecord !== null, 'Record must exist');
    assert(updatedRecord.lockCount === 2, 'Lock count should be 2 for round 2');

    const durationMs = updatedRecord.lockedUntil! - Date.now();
    // Round 1 was 15 min (900,000 ms). Round 2 should be approx 30 min (1,800,000 ms).
    assert(durationMs > 25 * 60 * 1000 && durationMs <= 30 * 60 * 1000, `Duration should be ~30 min, got ${durationMs} ms`);
  });

  // 11. Hash and salt never appear in any response
  await test('Hash and salt never appear in any response', async () => {
    const r1 = createMockReqRes('GET');
    await statusHandler(r1.req, r1.res);
    assert(!containsHashOrSalt(r1.mockRes.data), 'Status never leaks hash/salt');

    const r2 = createMockReqRes('POST', { pin: '4321' });
    await verifyHandler(r2.req, r2.res);
    assert(!containsHashOrSalt(r2.mockRes.data), 'Verify never leaks hash/salt');
  });

  // 12. Change-PIN needs valid token AND current PIN
  await test('Change-PIN requires valid token AND current PIN', async () => {
    // Reset lockout for change test
    const record = await memStore.get();
    record!.lockedUntil = null;
    record!.failedAttempts = 0;
    await memStore.update(record!);

    // Login to get a fresh token
    const loginRes = createMockReqRes('POST', { pin: '4321' });
    await verifyHandler(loginRes.req, loginRes.res);
    const userToken = loginRes.mockRes.data.token;

    // A. Without token -> 401
    const noToken = createMockReqRes('POST', { currentPin: '4321', newPin: '8888', confirm: '8888' });
    await changeHandler(noToken.req, noToken.res);
    assert(noToken.mockRes.statusCode === 401, 'Must require valid token');

    // B. With wrong current PIN -> 401
    const wrongPin = createMockReqRes('POST', { currentPin: '0000', newPin: '8888', confirm: '8888' }, { authorization: `Bearer ${userToken}` });
    await changeHandler(wrongPin.req, wrongPin.res);
    assert(wrongPin.mockRes.statusCode === 401, 'Must reject wrong current PIN');
    assert(wrongPin.mockRes.data.error.includes('Current PIN is incorrect'), 'Error message matches');

    // C. With mismatched confirm -> 400
    const mismatch = createMockReqRes('POST', { currentPin: '4321', newPin: '8888', confirm: '9999' }, { authorization: `Bearer ${userToken}` });
    await changeHandler(mismatch.req, mismatch.res);
    assert(mismatch.mockRes.statusCode === 400, 'Must reject mismatched confirm');

    // D. With correct current PIN and matching confirm -> 200
    const validChange = createMockReqRes('POST', { currentPin: '4321', newPin: '8888', confirm: '8888' }, { authorization: `Bearer ${userToken}` });
    await changeHandler(validChange.req, validChange.res);
    assert(validChange.mockRes.statusCode === 200, 'Must accept valid change');
    assert(validChange.mockRes.data.ok === true, 'ok should be true');
    assert(typeof validChange.mockRes.data.token === 'string', 'Returns new token');
    assert(!containsHashOrSalt(validChange.mockRes.data), 'Never leak hash/salt');

    // E. Verify old PIN is now invalid and new PIN works
    const oldVerify = createMockReqRes('POST', { pin: '4321' });
    await verifyHandler(oldVerify.req, oldVerify.res);
    assert(oldVerify.mockRes.statusCode === 401, 'Old PIN must no longer work');

    const newVerify = createMockReqRes('POST', { pin: '8888' });
    await verifyHandler(newVerify.req, newVerify.res);
    assert(newVerify.mockRes.statusCode === 200, 'New PIN must work');
    assert(newVerify.mockRes.data.ok === true, 'New PIN unlocks successfully');
  });

  console.log(`\nAll ${passedCount} tests passed successfully!`);
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
