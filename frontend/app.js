// VestingVault Token Equity Governance Frontend
const API_BASE = window.location.origin.includes('http') && !window.location.origin.startsWith('file:')
  ? window.location.origin
  : 'http://localhost:4024';

let allSchedules = [];

document.addEventListener('DOMContentLoaded', () => {
  setupSearch();
  setupModals();
  loadStats();
  loadSchedules();
});

function setupSearch() {
  document.getElementById('searchInput').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    renderSchedules(q);
  });
}

function setupModals() {
  const grantModal = document.getElementById('grantModal');
  const manageModal = document.getElementById('manageModal');

  document.getElementById('openGrantModal').addEventListener('click', () => {
    grantModal.classList.add('active');
  });

  document.getElementById('closeGrantBtn').addEventListener('click', () => {
    grantModal.classList.remove('active');
  });
  document.getElementById('cancelGrantBtn').addEventListener('click', () => {
    grantModal.classList.remove('active');
  });

  document.getElementById('closeManageBtn').addEventListener('click', () => {
    manageModal.classList.remove('active');
  });

  document.getElementById('grantScheduleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      beneficiary: document.getElementById('beneficiaryAddress').value.trim(),
      beneficiaryName: document.getElementById('beneficiaryName').value.trim(),
      role: document.getElementById('grantRole').value.trim(),
      totalAllocation: parseFloat(document.getElementById('grantAllocation').value),
      cliffMonths: parseInt(document.getElementById('grantCliff').value, 10),
      durationMonths: parseInt(document.getElementById('grantDuration').value, 10),
      revocable: true
    };

    try {
      const res = await fetch(`${API_BASE}/api/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to grant vesting schedule');
        return;
      }
      grantModal.classList.remove('active');
      document.getElementById('grantScheduleForm').reset();
      loadSchedules();
      loadStats();
    } catch (err) {
      alert('Error connecting to VestingVault backend: ' + err.message);
    }
  });
}

async function loadStats() {
  try {
    const res = await fetch(`${API_BASE}/api/stats`);
    if (!res.ok) throw new Error('API status ' + res.status);
    const data = await res.json();
    document.getElementById('totalCommitted').textContent = `${data.totalCommittedTokens.toLocaleString()} $VAULT`;
    document.getElementById('totalDisbursed').textContent = `${data.totalDisbursedTokens.toLocaleString()} $VAULT`;
  } catch (err) {
    // Keep defaults
  }
}

async function loadSchedules() {
  try {
    const res = await fetch(`${API_BASE}/api/schedules`);
    if (!res.ok) throw new Error('API status ' + res.status);
    const data = await res.json();
    allSchedules = data.schedules || [];
    renderSchedules();
  } catch (err) {
    allSchedules = [
      {
        id: 'sch-founding-eng',
        beneficiary: '0x1234567890123456789012345678901234567890',
        beneficiaryName: 'Dr. Evelyn Reed',
        role: 'Founding Cryptographer',
        totalAllocation: 100000.0,
        releasedAmount: 25000.0,
        cliffMonths: 6,
        durationMonths: 48,
        cliffReached: true,
        cliffDate: '2026-05-13T00:00:00Z',
        endDate: '2029-11-13T00:00:00Z',
        totalVested: 25000.0,
        claimable: 0.0,
        vestedPercent: 25,
        revoked: false
      },
      {
        id: 'sch-advisor-01',
        beneficiary: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        beneficiaryName: 'Soren Lindqvist',
        role: 'Strategic Ecosystem Advisor',
        totalAllocation: 40000.0,
        releasedAmount: 10000.0,
        cliffMonths: 3,
        durationMonths: 24,
        cliffReached: true,
        cliffDate: '2026-08-13T00:00:00Z',
        endDate: '2028-05-13T00:00:00Z',
        totalVested: 10000.0,
        claimable: 0.0,
        vestedPercent: 25,
        revoked: false
      },
      {
        id: 'sch-core-dev-02',
        beneficiary: '0x7777888899990000111122223333444455556666',
        beneficiaryName: 'Kai Nakamura',
        role: 'Senior Protocol Engineer',
        totalAllocation: 80000.0,
        releasedAmount: 0.0,
        cliffMonths: 6,
        durationMonths: 48,
        cliffReached: false,
        cliffDate: '2027-04-13T00:00:00Z',
        endDate: '2030-10-13T00:00:00Z',
        totalVested: 0.0,
        claimable: 0.0,
        vestedPercent: 0,
        revoked: false
      }
    ];
    renderSchedules();
  }
}

function renderSchedules(query = '') {
  const grid = document.getElementById('schedulesGrid');
  let filtered = allSchedules;

  if (query) {
    filtered = filtered.filter(s =>
      s.beneficiaryName.toLowerCase().includes(query) ||
      s.role.toLowerCase().includes(query) ||
      s.beneficiary.toLowerCase().includes(query)
    );
  }

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="loading-state">No matching vesting grants found.</div>';
    return;
  }

  grid.innerHTML = filtered.map(s => {
    let badge = '';
    if (s.revoked) {
      badge = '<span class="badge badge-revoked">REVOKED</span>';
    } else if (s.cliffReached) {
      badge = '<span class="badge badge-cliff-passed">CLIFF MATURED</span>';
    } else {
      badge = '<span class="badge badge-pre-cliff">CLIFF LOCKED</span>';
    }

    const cliffDateStr = new Date(s.cliffDate).toLocaleDateString();

    return `
      <div class="schedule-card" onclick="openScheduleManage('${escapeHtml(s.id)}')">
        <div class="card-top">
          <span style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(s.id)}</span>
          ${badge}
        </div>
        <h3 class="beneficiary-name">${escapeHtml(s.beneficiaryName)}</h3>
        <p class="beneficiary-role">${escapeHtml(s.role)}</p>

        <div class="metric-row">
          <div class="metric-item">
            <span class="metric-label">TOTAL ALLOCATION</span>
            <span class="metric-val">${s.totalAllocation.toLocaleString()}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">CLAIMABLE TOKENS</span>
            <span class="metric-val text-cyan">${s.claimable.toLocaleString()}</span>
          </div>
        </div>

        <div class="progress-section">
          <div class="progress-header">
            <span>Vested: ${s.totalVested.toLocaleString()} $VAULT</span>
            <span>${s.vestedPercent}%</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${s.vestedPercent}%;"></div>
          </div>
        </div>

        <div class="card-footer">
          <span>Cliff: ${cliffDateStr} (${s.cliffMonths}mo)</span>
          <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); openScheduleManage('${escapeHtml(s.id)}')">Manage &rarr;</button>
        </div>
      </div>
    `;
  }).join('');
}

window.openScheduleManage = async function(id) {
  const modal = document.getElementById('manageModal');
  const body = document.getElementById('manageBody');
  const title = document.getElementById('manageTitle');

  body.innerHTML = '<div class="loading-state">Loading on-chain vesting stream...</div>';
  modal.classList.add('active');

  try {
    const res = await fetch(`${API_BASE}/api/schedules/${id}`);
    if (!res.ok) throw new Error('API status ' + res.status);
    const s = await res.json();
    title.textContent = `${s.beneficiaryName} — ${s.role}`;

    const cliffDateStr = new Date(s.cliffDate).toLocaleDateString();
    const endDateStr = new Date(s.endDate).toLocaleDateString();
    const claims = s.claims || [];

    body.innerHTML = `
      <div style="margin-bottom: 1.5rem; background: var(--bg-surface); padding: 1.25rem; border-radius: 12px; border: 1px solid var(--border-color);">
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1rem; font-family: var(--font-mono); font-size: 0.85rem;">
          <div><span style="color: var(--text-muted); display: block; font-size: 0.72rem;">TOTAL ALLOCATION</span><strong>${s.totalAllocation.toLocaleString()} $VAULT</strong></div>
          <div><span style="color: var(--text-muted); display: block; font-size: 0.72rem;">RELEASED / CLAIMED</span><strong>${s.releasedAmount.toLocaleString()} $VAULT</strong></div>
          <div><span style="color: var(--text-muted); display: block; font-size: 0.72rem;">CLAIMABLE NOW</span><strong style="color: var(--primary);">${s.claimable.toLocaleString()} $VAULT</strong></div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; font-family: var(--font-mono); font-size: 0.85rem; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
          <div><span style="color: var(--text-muted); display: block; font-size: 0.72rem;">CLIFF MATURITY</span>${cliffDateStr}</div>
          <div><span style="color: var(--text-muted); display: block; font-size: 0.72rem;">FULL VESTING DATE</span>${endDateStr}</div>
          <div><span style="color: var(--text-muted); display: block; font-size: 0.72rem;">REVOCABLE BY DAO</span>${s.revocable ? 'YES' : 'NO (IRREVOCABLE)'}</div>
        </div>
      </div>

      <!-- Action buttons -->
      <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem;">
        ${!s.revoked && s.cliffReached && s.claimable > 0 ? `
          <button class="btn btn-primary" onclick="claimTokensAction('${escapeHtml(s.id)}')">Claim ${s.claimable.toLocaleString()} $VAULT</button>
        ` : ''}
        ${!s.revoked && s.revocable ? `
          <button class="btn btn-secondary" style="border-color: var(--accent-red); color: var(--accent-red);" onclick="revokeAction('${escapeHtml(s.id)}')">Revoke Unvested Grant</button>
        ` : ''}
      </div>

      <!-- Historical Claims -->
      <h4 style="margin-bottom: 0.75rem; font-size: 0.95rem;">Historical Token Claims</h4>
      ${claims.length === 0 ? '<p style="color: var(--text-muted); font-size: 0.85rem;">No tokens claimed yet from this grant.</p>' : `
        <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
              <th style="padding: 0.5rem;">Amount</th>
              <th style="padding: 0.5rem;">Transaction Hash</th>
              <th style="padding: 0.5rem;">Date</th>
            </tr>
          </thead>
          <tbody>
            ${claims.map(c => `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); font-family: var(--font-mono);">
                <td style="padding: 0.5rem; color: var(--primary); font-weight: 700;">+${c.amount.toLocaleString()} $VAULT</td>
                <td style="padding: 0.5rem; color: var(--text-muted); font-size: 0.78rem;">${escapeHtml(c.tx_hash)}</td>
                <td style="padding: 0.5rem; color: var(--text-muted);">${new Date(c.timestamp).toLocaleDateString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    `;
  } catch (err) {
    body.innerHTML = `<div class="loading-state" style="color: var(--accent-red);">${err.message}</div>`;
  }
};

window.claimTokensAction = async function(id) {
  try {
    const res = await fetch(`${API_BASE}/api/schedules/${id}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Claim failed');
      return;
    }
    const data = await res.json();
    alert(`Successfully claimed ${data.claimedAmount} $VAULT! Tx: ${data.txHash}`);
    openScheduleManage(id);
    loadSchedules();
    loadStats();
  } catch (err) {
    alert('Error claiming tokens: ' + err.message);
  }
};

window.revokeAction = async function(id) {
  if (!confirm('Are you sure you want to revoke this vesting schedule? Unvested tokens will return to the DAO treasury permanently.')) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/schedules/${id}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Revocation failed');
      return;
    }
    const data = await res.json();
    alert(`Schedule revoked. ${data.unvestedReturnedToTreasury} $VAULT returned to treasury. Vested preserved: ${data.vestedPreserved} $VAULT.`);
    openScheduleManage(id);
    loadSchedules();
    loadStats();
  } catch (err) {
    alert('Error revoking schedule: ' + err.message);
  }
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
