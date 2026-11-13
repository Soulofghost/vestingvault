import { db } from '../db.js';
import crypto from 'node:crypto';

const MS_PER_MONTH = 30 * 86400000;

export class VestingManager {
  calculateVestingStatus(schedule, asOfTimestamp = Date.now()) {
    const startTime = new Date(schedule.start_date).getTime();
    const cliffTime = startTime + schedule.cliff_months * MS_PER_MONTH;
    const endTime = startTime + schedule.duration_months * MS_PER_MONTH;

    const isRevoked = Boolean(schedule.revoked);
    const cliffReached = asOfTimestamp >= cliffTime;

    let totalVested = 0;
    if (isRevoked) {
      totalVested = schedule.total_allocation; // Allocation was reduced to vested at revocation
    } else if (asOfTimestamp < cliffTime) {
      totalVested = 0;
    } else if (asOfTimestamp >= endTime) {
      totalVested = schedule.total_allocation;
    } else {
      const elapsed = asOfTimestamp - startTime;
      const totalDuration = endTime - startTime;
      totalVested = (schedule.total_allocation * elapsed) / totalDuration;
    }

    const claimable = Math.max(0, totalVested - schedule.released_amount);
    const unvested = Math.max(0, schedule.total_allocation - totalVested);
    const vestedPercent = Math.min(100, Math.round((totalVested / schedule.total_allocation) * 100));

    return {
      id: schedule.id,
      beneficiary: schedule.beneficiary,
      beneficiaryName: schedule.beneficiary_name,
      role: schedule.role,
      totalAllocation: schedule.total_allocation,
      releasedAmount: schedule.released_amount,
      startDate: schedule.start_date,
      cliffMonths: schedule.cliff_months,
      durationMonths: schedule.duration_months,
      cliffDate: new Date(cliffTime).toISOString(),
      endDate: new Date(endTime).toISOString(),
      cliffReached,
      totalVested: parseFloat(totalVested.toFixed(2)),
      claimable: parseFloat(claimable.toFixed(2)),
      unvested: parseFloat(unvested.toFixed(2)),
      vestedPercent,
      revocable: Boolean(schedule.revocable),
      revoked: isRevoked
    };
  }

  listSchedules() {
    const rows = db.prepare('SELECT * FROM schedules ORDER BY created_at DESC;').all();
    return rows.map(r => this.calculateVestingStatus(r));
  }

  getSchedule(id) {
    const row = db.prepare('SELECT * FROM schedules WHERE id = ?;').get(id);
    if (!row) return null;

    const status = this.calculateVestingStatus(row);
    const claims = db.prepare('SELECT * FROM claims WHERE schedule_id = ? ORDER BY timestamp DESC;').all(id);

    return {
      ...status,
      claims
    };
  }

  createSchedule({ beneficiary, beneficiaryName, role, totalAllocation, startDate, cliffMonths, durationMonths, revocable = true }) {
    if (!beneficiary || !beneficiaryName || totalAllocation <= 0 || durationMonths <= 0) {
      throw new Error('Invalid schedule parameters: valid beneficiary, name, allocation > 0, duration > 0 required');
    }
    if (cliffMonths > durationMonths) {
      throw new Error('Cliff period cannot exceed total vesting duration');
    }

    const cleanBeneficiary = beneficiary.toLowerCase();
    const id = 'sch-' + crypto.randomBytes(6).toString('hex');
    const startIso = startDate ? new Date(startDate).toISOString() : new Date().toISOString();

    db.prepare(`
      INSERT INTO schedules (id, beneficiary, beneficiary_name, role, total_allocation, released_amount, start_date, cliff_months, duration_months, revocable, revoked)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 0);
    `).run(id, cleanBeneficiary, beneficiaryName, role || 'Team Member', totalAllocation, startIso, cliffMonths, durationMonths, revocable ? 1 : 0);

    return this.getSchedule(id);
  }

  claimTokens(scheduleId, amount = null) {
    const row = db.prepare('SELECT * FROM schedules WHERE id = ?;').get(scheduleId);
    if (!row) throw new Error(`Vesting schedule ${scheduleId} not found`);

    const status = this.calculateVestingStatus(row);
    if (status.revoked) throw new Error('Cannot claim: schedule has been revoked');
    if (!status.cliffReached) {
      throw new Error(`Cannot claim: cliff has not been reached yet (cliff date: ${new Date(status.cliffDate).toLocaleDateString()})`);
    }

    const claimAmount = amount ? Math.min(amount, status.claimable) : status.claimable;
    if (claimAmount <= 0) {
      throw new Error('No releasable tokens currently available for claim');
    }

    const txHash = '0x' + crypto.randomBytes(32).toString('hex');
    const claimId = 'clm-' + crypto.randomBytes(6).toString('hex');

    db.prepare(`
      INSERT INTO claims (id, schedule_id, amount, tx_hash)
      VALUES (?, ?, ?, ?);
    `).run(claimId, scheduleId, claimAmount, txHash);

    const newReleased = row.released_amount + claimAmount;
    db.prepare('UPDATE schedules SET released_amount = ? WHERE id = ?;').run(newReleased, scheduleId);

    return {
      claimId,
      scheduleId,
      claimedAmount: parseFloat(claimAmount.toFixed(2)),
      totalReleased: parseFloat(newReleased.toFixed(2)),
      txHash,
      timestamp: new Date().toISOString()
    };
  }

  revokeSchedule(scheduleId) {
    const row = db.prepare('SELECT * FROM schedules WHERE id = ?;').get(scheduleId);
    if (!row) throw new Error(`Vesting schedule ${scheduleId} not found`);
    if (!row.revocable) throw new Error('This vesting schedule is non-revocable');
    if (row.revoked) throw new Error('Schedule has already been revoked');

    const status = this.calculateVestingStatus(row);
    const vestedAtRevoke = status.totalVested;
    const unvestedReturned = Math.max(0, row.total_allocation - vestedAtRevoke);

    // Update allocation to vested amount and mark revoked
    db.prepare('UPDATE schedules SET total_allocation = ?, revoked = 1 WHERE id = ?;').run(vestedAtRevoke, scheduleId);

    const txHash = '0x' + crypto.randomBytes(32).toString('hex');
    return {
      scheduleId,
      vestedPreserved: parseFloat(vestedAtRevoke.toFixed(2)),
      unvestedReturnedToTreasury: parseFloat(unvestedReturned.toFixed(2)),
      txHash,
      revocationDate: new Date().toISOString()
    };
  }

  getTreasuryStats() {
    const schedules = db.prepare('SELECT * FROM schedules;').all();
    let totalAllocated = 0;
    let totalReleased = 0;
    let totalUnvested = 0;

    for (const s of schedules) {
      const st = this.calculateVestingStatus(s);
      totalAllocated += s.total_allocation;
      totalReleased += s.released_amount;
      totalUnvested += st.unvested;
    }

    return {
      totalSchedules: schedules.length,
      totalCommittedTokens: parseFloat(totalAllocated.toFixed(2)),
      totalDisbursedTokens: parseFloat(totalReleased.toFixed(2)),
      totalUnvestedTokens: parseFloat(totalUnvested.toFixed(2)),
      smartContract: 'VestingVault.sol (ERC20 Linear)'
    };
  }
}

export const vestingManager = new VestingManager();
