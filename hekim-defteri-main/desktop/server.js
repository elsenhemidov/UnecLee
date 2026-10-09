const express = require('express');
const cors = require('cors');
const path = require('path');
const database = require('./database');
const { createBackup, restoreBackup, listBackups, autoBackupIfNeeded } = require('./database');
const license = require('./license');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Auto backup on server start
try {
  const backupResult = autoBackupIfNeeded();
  if (backupResult.created) {
    console.log(`[Server] Avtomatik backup yaratıldı: ${backupResult.reason}`);
  }
} catch (err) {
  console.error('[Server] Auto backup xətası:', err);
}

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'frontend')));

// ===== LICENSE API =====
app.get('/api/license/status', (req, res) => {
  try {
    const status = license.checkLicense();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/license/hardware-id', (req, res) => {
  try {
    const hardwareId = license.getHardwareId();
    res.json({ hardwareId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/license/activate', (req, res) => {
  try {
    const { licenseKey } = req.body;
    if (!licenseKey) {
      return res.status(400).json({ success: false, message: 'Lisenziya kodu tələb olunur' });
    }
    const result = license.activateLicense(licenseKey);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ===== API ROUTES =====

// Dashboard
app.get('/api/dashboard', async (req, res) => {
  try {
    const stats = await database.getDashboardStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== PATIENTS =====
app.get('/api/patients', async (req, res) => {
  try {
    const { search } = req.query;
    const patients = await database.getAllPatients(search);
    res.json(patients);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/patients', async (req, res) => {
  try {
    const patient = await database.createPatient(req.body);
    res.status(201).json({ id: patient.id, message: 'Xəstə əlavə edildi' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/patients/:id', async (req, res) => {
  try {
    const patient = await database.getPatientById(req.params.id);
    if (!patient) {
      return res.status(404).json({ error: 'Xəstə tapılmadı' });
    }
    const transactions = await database.getPatientTransactions(req.params.id);
    const totalDebt = await database.getPatientTotalDebt(req.params.id);
    res.json({ ...patient, transactions, totalDebt });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/patients/:id', async (req, res) => {
  try {
    await database.updatePatient(req.params.id, req.body);
    res.json({ message: 'Xəstə yeniləndi' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/patients/:id', async (req, res) => {
  try {
    await database.deletePatient(req.params.id);
    res.json({ message: 'Xəstə silindi' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== TRANSACTIONS =====
app.get('/api/transactions', async (req, res) => {
  try {
    const { status, patient_id } = req.query;
    const transactions = await database.getAllTransactions({ status, patient_id });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/transactions', async (req, res) => {
  try {
    const transaction = await database.createTransaction(req.body);
    res.status(201).json({ id: transaction.id, message: 'Əməliyyat əlavə edildi' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/transactions/:id', async (req, res) => {
  try {
    const transaction = await database.getTransactionById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ error: 'Əməliyyat tapılmadı' });
    }
    const payments = await database.getAllPayments({ transaction_id: req.params.id });
    res.json({ ...transaction, payments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/transactions/:id', async (req, res) => {
  try {
    await database.updateTransaction(req.params.id, req.body);
    res.json({ message: 'Əməliyyat yeniləndi' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/transactions/:id', async (req, res) => {
  try {
    await database.deleteTransaction(req.params.id);
    res.json({ message: 'Əməliyyat silindi' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/transactions/debtors/list', async (req, res) => {
  try {
    const debtors = await database.getDebtors();
    res.json(debtors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== PAYMENTS =====
app.get('/api/payments', async (req, res) => {
  try {
    const { transaction_id, start_date, end_date } = req.query;
    const payments = await database.getAllPayments({ transaction_id, start_date, end_date });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/payments', async (req, res) => {
  try {
    const payment = await database.createPayment(req.body);
    res.status(201).json({ id: payment.id, message: 'Ödəniş qeydə alındı' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/payments/:id', async (req, res) => {
  try {
    await database.deletePayment(req.params.id);
    res.json({ message: 'Ödəniş silindi' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/payments/summary/daily', async (req, res) => {
  try {
    const { date } = req.query;
    const summary = await database.getDailySummary(date);
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== SERVICES =====
app.get('/api/services', async (req, res) => {
  try {
    const services = await database.getAllServices();
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/services', async (req, res) => {
  try {
    const service = await database.createService(req.body);
    res.status(201).json({ id: service.id, message: 'Xidmət əlavə edildi' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/services/:id', async (req, res) => {
  try {
    await database.updateService(req.params.id, req.body);
    res.json({ message: 'Xidmət yeniləndi' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/services/:id', async (req, res) => {
  try {
    await database.deleteService(req.params.id);
    res.json({ message: 'Xidmət silindi' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== REMINDERS =====
app.get('/api/reminders', async (req, res) => {
  try {
    const { pending_only } = req.query;
    const reminders = await database.getAllReminders(pending_only === 'true');
    res.json(reminders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reminders/today', async (req, res) => {
  try {
    const reminders = await database.getTodayReminders();
    res.json(reminders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reminders/overdue', async (req, res) => {
  try {
    const overduePayments = await database.getOverduePayments();
    res.json(overduePayments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reminders', async (req, res) => {
  try {
    const reminder = await database.createReminder(req.body);
    res.status(201).json({ id: reminder.id, message: 'Xatırlatma əlavə edildi' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/reminders/:id/mark-sent', async (req, res) => {
  try {
    await database.markReminderSent(req.params.id);
    res.json({ message: 'Xatırlatma göndərilmiş kimi işarələndi' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/reminders/:id', async (req, res) => {
  try {
    await database.deleteReminder(req.params.id);
    res.json({ message: 'Xatırlatma silindi' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== REPORTS =====
app.get('/api/reports/monthly', async (req, res) => {
  try {
    const { year, month } = req.query;
    const report = await database.getMonthlyReport(year, month);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/yearly', async (req, res) => {
  try {
    const { year } = req.query;
    const report = await database.getYearlyReport(year);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/top-debtors', async (req, res) => {
  try {
    const { limit } = req.query;
    const debtors = await database.getTopDebtors(parseInt(limit) || 10);
    res.json(debtors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== APPOINTMENTS =====
app.get('/api/appointments', async (req, res) => {
  try {
    const { date } = req.query;
    const appointments = await database.getAllAppointments(date);
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/appointments', async (req, res) => {
  try {
    const appointment = await database.createAppointment(req.body);
    res.status(201).json({ id: appointment.id, message: 'Randevu əlavə edildi' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/appointments/:id', async (req, res) => {
  try {
    await database.updateAppointment(req.params.id, req.body);
    res.json({ message: 'Randevu yeniləndi' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/appointments/:id', async (req, res) => {
  try {
    await database.deleteAppointment(req.params.id);
    res.json({ message: 'Randevu silindi' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== SEARCH =====
app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    const results = await database.searchAll(q);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== PATIENT PROFILE =====
app.get('/api/patients/:id/profile', async (req, res) => {
  try {
    const profile = await database.getPatientProfile(req.params.id);
    if (!profile) {
      return res.status(404).json({ error: 'Xəstə tapılmadı' });
    }
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== UPDATE (Avtomatik Yeniləmə) =====
app.get('/api/update/status', (req, res) => {
  try {
    const updateFns = global.updateFunctions;
    if (updateFns) {
      res.json(updateFns.getUpdateStatus());
    } else {
      res.json({ status: 'idle', version: null, progress: null, error: null });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/update/check', async (req, res) => {
  try {
    const updateFns = global.updateFunctions;
    if (updateFns) {
      await updateFns.checkForUpdates();
      res.json({ message: 'Yeniləmə yoxlanılır...' });
    } else {
      res.json({ message: 'Updater mövcud deyil (development mode)' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/update/download', async (req, res) => {
  try {
    const updateFns = global.updateFunctions;
    if (updateFns) {
      await updateFns.downloadUpdate();
      res.json({ message: 'Yeniləmə yüklənir...' });
    } else {
      res.json({ message: 'Updater mövcud deyil' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/update/install', (req, res) => {
  try {
    const updateFns = global.updateFunctions;
    if (updateFns) {
      res.json({ message: 'Proqram yenidən başladılacaq...' });
      setTimeout(() => updateFns.installUpdate(), 1000);
    } else {
      res.json({ message: 'Updater mövcud deyil' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== BACKUP =====
app.get('/api/backups', (req, res) => {
  try {
    const backups = listBackups();
    res.json(backups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/backups/create', (req, res) => {
  try {
    const backupPath = createBackup();
    if (backupPath) {
      res.json({ message: 'Backup yaradıldı', path: backupPath });
    } else {
      res.status(500).json({ error: 'Backup yaradıla bilmədi' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/backups/restore', (req, res) => {
  try {
    const { fileName } = req.body;
    if (!fileName) {
      return res.status(400).json({ error: 'Backup fayl adı tələb olunur' });
    }
    const result = restoreBackup(fileName);
    if (result.success) {
      res.json({ message: result.message });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// App version info
app.get('/api/app/version', (req, res) => {
  try {
    const packageJson = require('./package.json');
    res.json({
      version: packageJson.version,
      name: packageJson.productName || packageJson.name
    });
  } catch (error) {
    res.json({ version: 'unknown', name: 'Həkim Borc Dəftəri' });
  }
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Global error handler middleware (must be after all routes)
app.use((err, req, res, next) => {
  console.error('[Server Xəta]:', err);
  res.status(500).json({ 
    error: 'Server xətası baş verdi',
    details: err.message 
  });
});

app.listen(PORT, () => {
  console.log(`Server ${PORT} portunda işləyir`);
});
