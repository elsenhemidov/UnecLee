import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import database from './models/database.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Dashboard
app.get('/api/dashboard', (req, res) => {
  try {
    const stats = database.getDashboardStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== PATIENTS =====

// ===== APPOINTMENTS =====
app.get('/api/appointments', (req, res) => {
  try {
    const { date } = req.query;
    const appointments = database.getAllAppointments(date);
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
    const appointment = await database.updateAppointment(req.params.id, req.body);
    if (!appointment) {
      return res.status(404).json({ error: 'Randevu tap\u0131lmad\u0131' });
    }
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
app.get('/api/search', (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.json({ patients: [] });
    }
    const patients = database.getAllPatients(q);
    const today = new Date().toISOString().split('T')[0];

    const enriched = patients.map(p => {
      const totalDebt = database.getPatientTotalDebt(p.id);
      const transactions = database.getPatientTransactions(p.id);
      const lastTransaction = transactions.length > 0 ? transactions[0] : null;

      // Upcoming appointment
      const allAppts = database.getAllAppointments();
      const upcoming = allAppts
        .filter(a => a.patient_id === p.id && a.tarix >= today && a.status !== 'legv_edildi' && a.status !== 'tamamlandi')
        .sort((a, b) => (a.tarix + a.saat).localeCompare(b.tarix + b.saat));
      const upcomingAppointment = upcoming.length > 0 ? upcoming[0] : null;

      return {
        id: p.id,
        ad: p.ad,
        soyad: p.soyad,
        telefon: p.telefon,
        totalDebt,
        lastTransaction,
        upcomingAppointment
      };
    });

    res.json({ patients: enriched });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== PATIENT PROFILE =====
app.get('/api/patients/:id/profile', (req, res) => {
  try {
    const patient = database.getPatientById(req.params.id);
    if (!patient) {
      return res.status(404).json({ error: 'Xəstə tapılmadı' });
    }

    const transactions = database.getPatientTransactions(req.params.id);
    const totalDebt = database.getPatientTotalDebt(req.params.id);

    // Total paid
    const totalPaid = transactions.reduce((sum, t) => sum + (t.odenis_mebleg || 0), 0);

    // Patient payments
    const allPayments = database.getAllPayments({});
    const patientTxIds = transactions.map(t => t.id);
    const payments = allPayments.filter(p => patientTxIds.includes(p.transaction_id));

    // Patient appointments
    const appointments = database.getAllAppointments().filter(a => a.patient_id === req.params.id);

    res.json({
      ...patient,
      transactions,
      payments,
      appointments,
      totalDebt,
      totalPaid
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/patients', (req, res) => {
  try {
    const { search } = req.query;
    const patients = database.getAllPatients(search);
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

app.get('/api/patients/:id', (req, res) => {
  try {
    const patient = database.getPatientById(req.params.id);
    if (!patient) {
      return res.status(404).json({ error: 'Xəstə tapılmadı' });
    }
    const transactions = database.getPatientTransactions(req.params.id);
    const totalDebt = database.getPatientTotalDebt(req.params.id);
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
app.get('/api/transactions', (req, res) => {
  try {
    const { status, patient_id } = req.query;
    const transactions = database.getAllTransactions({ status, patient_id });
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

app.get('/api/transactions/:id', (req, res) => {
  try {
    const transaction = database.getTransactionById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ error: 'Əməliyyat tapılmadı' });
    }
    const payments = database.getAllPayments({ transaction_id: req.params.id });
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

app.get('/api/transactions/debtors/list', (req, res) => {
  try {
    const debtors = database.getDebtors();
    res.json(debtors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== PAYMENTS =====
app.get('/api/payments', (req, res) => {
  try {
    const { transaction_id, start_date, end_date } = req.query;
    const payments = database.getAllPayments({ transaction_id, start_date, end_date });
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

app.put('/api/payments/:id', async (req, res) => {
  try {
    const payment = await database.updatePayment(req.params.id, req.body);
    if (!payment) {
      return res.status(404).json({ error: 'Ödəniş tapılmadı' });
    }
    res.json({ message: 'Ödəniş yeniləndi' });
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

app.get('/api/payments/summary/daily', (req, res) => {
  try {
    const { date } = req.query;
    const summary = database.getDailySummary(date);
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== SERVICES =====
app.get('/api/services', (req, res) => {
  try {
    const services = database.getAllServices();
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
app.get('/api/reminders', (req, res) => {
  try {
    const { pending_only } = req.query;
    const reminders = database.getAllReminders(pending_only === 'true');
    res.json(reminders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reminders/today', (req, res) => {
  try {
    const reminders = database.getTodayReminders();
    res.json(reminders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reminders/overdue', (req, res) => {
  try {
    const overduePayments = database.getOverduePayments();
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
app.get('/api/reports/monthly', (req, res) => {
  try {
    const { year, month } = req.query;
    const report = database.getMonthlyReport(year, month);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/yearly', (req, res) => {
  try {
    const { year } = req.query;
    const report = database.getYearlyReport(year);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/top-debtors', (req, res) => {
  try {
    const { limit } = req.query;
    const debtors = database.getTopDebtors(parseInt(limit) || 10);
    res.json(debtors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Hər gün gecikən ödənişləri yoxla (səhər 9:00-da)
cron.schedule('0 9 * * *', async () => {
  console.log('Gecikən ödənişlər yoxlanılır...');
  await database.updateOverdueStatus();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server ${PORT} portunda işləyir`);
  console.log(`http://localhost:${PORT}`);
});
