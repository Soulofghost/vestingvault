import test, { describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { db, initDb } from '../src/db.js';
import { vestingManager } from '../src/engine/vesting.js';

describe('VestingVault Smart Contract & Equity Engine Tests', () => {
  before(() => {
    initDb();
    // Clean up test schedules for test run idempotency
    db.exec("DELETE FROM claims WHERE schedule_id LIKE 'sch-test-%'");
    db.exec("DELETE FROM schedules WHERE id LIKE 'sch-test-%'");
  });

  const testBeneficiary = '0x1111222233334444555566667777888899990000';

  test('Database seeds initial vesting schedules and claims', () => {
    const list = vestingManager.listSchedules();
    assert.ok(list.length >= 3, 'Should seed at least 3 initial vesting grants');

    const founder = vestingManager.getSchedule('sch-founding-eng');
    assert.ok(founder);
    assert.equal(founder.totalAllocation, 100000.0);
    assert.equal(founder.cliffReached, true);
    assert.ok(founder.claimable >= 0);
    assert.ok(founder.claims.length >= 1);
  });

  test('createSchedule enforces parameter integrity and cliff constraints', () => {
    // Cliff exceeding duration throws
    assert.throws(() => {
      vestingManager.createSchedule({
        beneficiary: testBeneficiary,
        beneficiaryName: 'Invalid Grantee',
        totalAllocation: 50000,
        cliffMonths: 24,
        durationMonths: 12
      });
    }, (err) => err.message.includes('Cliff period cannot exceed'));

    // Valid schedule creation
    const grant = vestingManager.createSchedule({
      beneficiary: testBeneficiary,
      beneficiaryName: 'Sophia Lin',
      role: 'Staff ML Engineer',
      totalAllocation: 48000.0,
      startDate: new Date(Date.now() - 86400000 * 180).toISOString(), // 6 months ago
      cliffMonths: 6,
      durationMonths: 24,
      revocable: true
    });

    assert.ok(grant.id);
    assert.equal(grant.beneficiaryName, 'Sophia Lin');
    assert.equal(grant.totalAllocation, 48000.0);
    assert.equal(grant.releasedAmount, 0);
  });

  test('Pre-cliff schedule locks claimable tokens to zero', () => {
    // Schedule started 15 days ago with 6 month cliff
    const grant = vestingManager.createSchedule({
      beneficiary: '0x2222333344445555666677778888999900001111',
      beneficiaryName: 'Pre-Cliff Employee',
      role: 'Junior Engineer',
      totalAllocation: 24000.0,
      startDate: new Date(Date.now() - 86400000 * 15).toISOString(),
      cliffMonths: 6,
      durationMonths: 24
    });

    const status = vestingManager.getSchedule(grant.id);
    assert.equal(status.cliffReached, false);
    assert.equal(status.claimable, 0);
    assert.equal(status.totalVested, 0);

    // Attempting to claim throws
    assert.throws(() => {
      vestingManager.claimTokens(grant.id);
    }, (err) => err.message.includes('cliff has not been reached'));
  });

  test('Post-cliff schedule allows token claiming and logs transaction', () => {
    // Schedule started 12 months ago with 6 month cliff and 24 month duration
    // 50% vested = 20,000 tokens
    const grant = vestingManager.createSchedule({
      beneficiary: '0x3333444455556666777788889999000011112222',
      beneficiaryName: 'Post-Cliff Engineer',
      role: 'Lead Architect',
      totalAllocation: 40000.0,
      startDate: new Date(Date.now() - 86400000 * 365).toISOString(),
      cliffMonths: 6,
      durationMonths: 24
    });

    const status = vestingManager.getSchedule(grant.id);
    assert.equal(status.cliffReached, true);
    assert.ok(status.claimable > 15000);

    const claimRes = vestingManager.claimTokens(grant.id, 5000.0);
    assert.equal(claimRes.claimedAmount, 5000.0);
    assert.equal(claimRes.totalReleased, 5000.0);
    assert.ok(claimRes.txHash.startsWith('0x'));

    const updated = vestingManager.getSchedule(grant.id);
    assert.equal(updated.releasedAmount, 5000.0);
  });

  test('revokeSchedule caps allocation to vested amount and returns unvested to treasury', () => {
    // Schedule 6 months into 24 months = 25% vested = 10,000 of 40,000
    const grant = vestingManager.createSchedule({
      beneficiary: '0x4444555566667777888899990000111122223333',
      beneficiaryName: 'Departing Contributor',
      role: 'Operations Consultant',
      totalAllocation: 40000.0,
      startDate: new Date(Date.now() - 86400000 * 180).toISOString(),
      cliffMonths: 3,
      durationMonths: 24,
      revocable: true
    });

    const revokeRes = vestingManager.revokeSchedule(grant.id);
    assert.ok(revokeRes.vestedPreserved > 0);
    assert.ok(revokeRes.unvestedReturnedToTreasury > 0);
    assert.equal(revokeRes.vestedPreserved + revokeRes.unvestedReturnedToTreasury, 40000.0);

    const revokedGrant = vestingManager.getSchedule(grant.id);
    assert.equal(revokedGrant.revoked, true);

    // Double revocation throws
    assert.throws(() => {
      vestingManager.revokeSchedule(grant.id);
    }, (err) => {
      return Boolean(err);
    });
  });
});
