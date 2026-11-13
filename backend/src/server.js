import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import { vestingManager } from './engine/vesting.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(join(__dirname, '../../frontend')));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'VestingVault',
    version: '1.0.0',
    tokenSymbol: config.tokenSymbol,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/stats', (req, res) => {
  try {
    const stats = vestingManager.getTreasuryStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/schedules', (req, res) => {
  try {
    const schedules = vestingManager.listSchedules();
    res.json({ total: schedules.length, schedules });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/schedules/:id', (req, res) => {
  try {
    const schedule = vestingManager.getSchedule(req.params.id);
    if (!schedule) {
      return res.status(404).json({ error: 'Vesting schedule not found' });
    }
    res.json(schedule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/schedules', (req, res) => {
  try {
    const { beneficiary, beneficiaryName, role, totalAllocation, startDate, cliffMonths, durationMonths, revocable } = req.body;
    const schedule = vestingManager.createSchedule({
      beneficiary,
      beneficiaryName,
      role,
      totalAllocation: parseFloat(totalAllocation),
      startDate,
      cliffMonths: parseInt(cliffMonths, 10),
      durationMonths: parseInt(durationMonths, 10),
      revocable: revocable !== false
    });
    res.status(201).json(schedule);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/schedules/:id/claim', (req, res) => {
  try {
    const amount = req.body.amount ? parseFloat(req.body.amount) : null;
    const result = vestingManager.claimTokens(req.params.id, amount);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/schedules/:id/revoke', (req, res) => {
  try {
    const result = vestingManager.revokeSchedule(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(config.port, () => {
    console.log(`VestingVault Token Governance Gateway listening on port ${config.port}`);
  });
}

export default app;
