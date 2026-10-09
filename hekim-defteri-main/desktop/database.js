const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Get database path - store in AppData for persistence
const getDbPath = () => {
  const appData = process.env.APPDATA || process.env.HOME || __dirname;
  const dbFolder = path.join(appData, 'HekimBorcDefteri');

  if (!fs.existsSync(dbFolder)) {
    fs.mkdirSync(dbFolder, { recursive: true });
  }

  return path.join(dbFolder, 'hekim.json');
};

// Get backup folder path
const getBackupFolder = () => {
  const appData = process.env.APPDATA || process.env.HOME || __dirname;
  const backupFolder = path.join(appData, 'HekimBorcDefteri', 'backups');

  if (!fs.existsSync(backupFolder)) {
    fs.mkdirSync(backupFolder, { recursive: true });
  }

  return backupFolder;
};

// Create a backup of the database before updates
const createBackup = () => {
  try {
    const dbPath = getDbPath();
    if (!fs.existsSync(dbPath)) return null;

    const backupFolder = getBackupFolder();
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupFolder, `hekim-backup-${timestamp}.json`);

    fs.copyFileSync(dbPath, backupPath);
    console.log(`Backup yaradıldı: ${backupPath}`);

    // Keep only last 20 backups
    const backups = fs.readdirSync(backupFolder)
      .filter(f => f.startsWith('hekim-backup-') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (backups.length > 20) {
      backups.slice(20).forEach(f => {
        fs.unlinkSync(path.join(backupFolder, f));
      });
    }

    return backupPath;
  } catch (err) {
    console.error('Backup xətası:', err);
    return null;
  }
};

// Restore from a specific backup
const restoreBackup = (backupFileName) => {
  try {
    const backupFolder = getBackupFolder();
    const backupPath = path.join(backupFolder, backupFileName);
    const dbPath = getDbPath();

    if (!fs.existsSync(backupPath)) return { success: false, error: 'Backup tapılmadı' };

    // Create a safety backup before restoring
    const safetyBackup = path.join(backupFolder, `hekim-prerestore-${Date.now()}.json`);
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, safetyBackup);
    }

    fs.copyFileSync(backupPath, dbPath);
    data = null; // Force reload
    loadData();

    return { success: true, message: 'Backup bərpa edildi' };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// List available backups
const listBackups = () => {
  try {
    const backupFolder = getBackupFolder();
    if (!fs.existsSync(backupFolder)) return [];

    return fs.readdirSync(backupFolder)
      .filter(f => f.startsWith('hekim-backup-') && f.endsWith('.json'))
      .sort()
      .reverse()
      .map(f => {
        const stats = fs.statSync(path.join(backupFolder, f));
        return {
          fileName: f,
          size: stats.size,
          date: stats.mtime.toISOString()
        };
      });
  } catch (err) {
    return [];
  }
};

// Auto backup if last backup is older than 24 hours
const autoBackupIfNeeded = () => {
  try {
    const backups = listBackups();
    
    if (backups.length === 0) {
      // Heç backup yoxdur, ilk backup yarat
      console.log('[AutoBackup] İlk backup yaratılır...');
      createBackup();
      return { created: true, reason: 'ilk_backup' };
    }
    
    // Son backup-ın tarixi
    const lastBackupDate = new Date(backups[0].date);
    const now = new Date();
    const hoursSinceLastBackup = (now - lastBackupDate) / (1000 * 60 * 60);
    
    if (hoursSinceLastBackup >= 24) {
      console.log(`[AutoBackup] Son backup ${Math.floor(hoursSinceLastBackup)} saat əvvəl. Avtomatik backup yaratılır...`);
      createBackup();
      return { created: true, reason: 'gündəlik', hoursSince: Math.floor(hoursSinceLastBackup) };
    }
    
    console.log(`[AutoBackup] Son backup ${Math.floor(hoursSinceLastBackup)} saat əvvəl. Backup lazım deyil.`);
    return { created: false, hoursSince: Math.floor(hoursSinceLastBackup) };
  } catch (err) {
    console.error('[AutoBackup] Xəta:', err);
    return { created: false, error: err.message };
  }
};

// Default data structure
const defaultData = {
  patients: [],
  services: [],
  transactions: [],
  payments: [],
  reminders: [],
  appointments: []
};

let data = null;

const loadData = () => {
  if (data) return data;
  const dbPath = getDbPath();
  if (fs.existsSync(dbPath)) {
    try {
      data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      // Ensure all keys exist
      for (const key of Object.keys(defaultData)) {
        if (!data[key]) data[key] = [];
      }
    } catch {
      data = JSON.parse(JSON.stringify(defaultData));
    }
  } else {
    data = JSON.parse(JSON.stringify(defaultData));
  }
  return data;
};

const saveData = () => {
  try {
    fs.writeFileSync(getDbPath(), JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Database save error:', err);
  }
};

// Initialize on first load
loadData();

// ===== DATABASE API =====
const database = {

  // ===== PATIENTS =====
  getAllPatients: async (search = '') => {
    loadData();
    let patients = data.patients;
    if (search) {
      const term = search.toLowerCase();
      patients = patients.filter(p =>
        p.ad.toLowerCase().includes(term) ||
        p.soyad.toLowerCase().includes(term) ||
        (p.telefon && p.telefon.includes(term))
      );
    }
    return patients.sort((a, b) => new Date(b.yaradilma_tarixi) - new Date(a.yaradilma_tarixi));
  },

  getPatientById: async (id) => {
    loadData();
    return data.patients.find(p => p.id === id);
  },

  createPatient: async (patient) => {
    loadData();
    const newPatient = {
      id: uuidv4(),
      ...patient,
      yaradilma_tarixi: new Date().toISOString(),
      yenilenme_tarixi: new Date().toISOString()
    };
    data.patients.push(newPatient);
    saveData();
    return newPatient;
  },

  updatePatient: async (id, updateData) => {
    loadData();
    const index = data.patients.findIndex(p => p.id === id);
    if (index !== -1) {
      data.patients[index] = {
        ...data.patients[index],
        ...updateData,
        yenilenme_tarixi: new Date().toISOString()
      };
      saveData();
      return data.patients[index];
    }
    return null;
  },

  deletePatient: async (id) => {
    loadData();
    data.patients = data.patients.filter(p => p.id !== id);
    data.transactions = data.transactions.filter(t => t.patient_id !== id);
    data.payments = data.payments.filter(p => {
      const t = data.transactions.find(tr => tr.id === p.transaction_id);
      return t !== undefined;
    });
    saveData();
  },

  getPatientTransactions: async (patientId) => {
    loadData();
    return data.transactions
      .filter(t => t.patient_id === patientId)
      .sort((a, b) => new Date(b.tarix) - new Date(a.tarix));
  },

  getPatientTotalDebt: async (patientId) => {
    loadData();
    return data.transactions
      .filter(t => t.patient_id === patientId && t.status !== 'odenildi')
      .reduce((sum, t) => sum + (t.borc_mebleg || 0), 0);
  },

  // ===== TRANSACTIONS =====
  getAllTransactions: async (filters = {}) => {
    loadData();
    let transactions = data.transactions.map(t => {
      const patient = data.patients.find(p => p.id === t.patient_id);
      return {
        ...t,
        ad: patient?.ad || '',
        soyad: patient?.soyad || '',
        telefon: patient?.telefon || ''
      };
    });

    if (filters.status) {
      transactions = transactions.filter(t => t.status === filters.status);
    }
    if (filters.patient_id) {
      transactions = transactions.filter(t => t.patient_id === filters.patient_id);
    }

    return transactions.sort((a, b) => new Date(b.tarix) - new Date(a.tarix));
  },

  getTransactionById: async (id) => {
    loadData();
    const t = data.transactions.find(tr => tr.id === id);
    if (t) {
      const patient = data.patients.find(p => p.id === t.patient_id);
      return {
        ...t,
        ad: patient?.ad || '',
        soyad: patient?.soyad || '',
        telefon: patient?.telefon || ''
      };
    }
    return null;
  },

  createTransaction: async (txData) => {
    loadData();
    const mebleg = parseFloat(txData.mebleg) || 0;
    const odenisMebleg = parseFloat(txData.odenis_mebleg) || 0;
    const borcMebleg = mebleg - odenisMebleg;

    const newTransaction = {
      id: uuidv4(),
      patient_id: txData.patient_id,
      service_id: txData.service_id || null,
      tesvir: txData.tesvir,
      mebleg: mebleg,
      odenis_mebleg: odenisMebleg,
      borc_mebleg: borcMebleg,
      tarix: new Date().toISOString(),
      son_odenis_tarixi: txData.son_odenis_tarixi || null,
      status: odenisMebleg >= mebleg ? 'odenildi' : (odenisMebleg > 0 ? 'qismen_odenildi' : 'gozleyir'),
      xatirlatma_aktiv: true
    };

    data.transactions.push(newTransaction);
    saveData();
    return newTransaction;
  },

  updateTransaction: async (id, updateData) => {
    loadData();
    const index = data.transactions.findIndex(t => t.id === id);
    if (index !== -1) {
      const current = data.transactions[index];
      const mebleg = parseFloat(updateData.mebleg) || current.mebleg;
      const borcMebleg = mebleg - current.odenis_mebleg;

      data.transactions[index] = {
        ...current,
        tesvir: updateData.tesvir || current.tesvir,
        mebleg: mebleg,
        borc_mebleg: borcMebleg,
        son_odenis_tarixi: updateData.son_odenis_tarixi !== undefined ? updateData.son_odenis_tarixi : current.son_odenis_tarixi,
        xatirlatma_aktiv: updateData.xatirlatma_aktiv !== undefined ? updateData.xatirlatma_aktiv : current.xatirlatma_aktiv
      };
      saveData();
      return data.transactions[index];
    }
    return null;
  },

  deleteTransaction: async (id) => {
    loadData();
    data.transactions = data.transactions.filter(t => t.id !== id);
    data.payments = data.payments.filter(p => p.transaction_id !== id);
    saveData();
  },

  getDebtors: async () => {
    loadData();
    const debtorMap = {};

    data.transactions
      .filter(t => t.status !== 'odenildi')
      .forEach(t => {
        if (!debtorMap[t.patient_id]) {
          const patient = data.patients.find(p => p.id === t.patient_id);
          if (patient) {
            debtorMap[t.patient_id] = {
              id: patient.id,
              ad: patient.ad,
              soyad: patient.soyad,
              telefon: patient.telefon,
              total_borc: 0,
              transaction_count: 0
            };
          }
        }
        if (debtorMap[t.patient_id]) {
          debtorMap[t.patient_id].total_borc += t.borc_mebleg || 0;
          debtorMap[t.patient_id].transaction_count++;
        }
      });

    return Object.values(debtorMap)
      .filter(d => d.total_borc > 0)
      .sort((a, b) => b.total_borc - a.total_borc);
  },

  // ===== PAYMENTS =====
  getAllPayments: async (filters = {}) => {
    loadData();
    let payments = data.payments.map(p => {
      const t = data.transactions.find(tr => tr.id === p.transaction_id);
      const patient = t ? data.patients.find(pt => pt.id === t.patient_id) : null;
      return {
        ...p,
        transaction_tesvir: t?.tesvir || '',
        ad: patient?.ad || '',
        soyad: patient?.soyad || ''
      };
    });

    if (filters.transaction_id) {
      payments = payments.filter(p => p.transaction_id === filters.transaction_id);
    }
    if (filters.start_date) {
      payments = payments.filter(p => p.tarix.split('T')[0] >= filters.start_date);
    }
    if (filters.end_date) {
      payments = payments.filter(p => p.tarix.split('T')[0] <= filters.end_date);
    }

    return payments.sort((a, b) => new Date(b.tarix) - new Date(a.tarix));
  },

  createPayment: async (payData) => {
    loadData();
    const newPayment = {
      id: uuidv4(),
      transaction_id: payData.transaction_id,
      mebleg: parseFloat(payData.mebleg) || 0,
      odenis_usulu: payData.odenis_usulu || 'nagd',
      qeyd: payData.qeyd || '',
      tarix: new Date().toISOString()
    };

    data.payments.push(newPayment);

    // Update related transaction
    const tIndex = data.transactions.findIndex(t => t.id === payData.transaction_id);
    if (tIndex !== -1) {
      const t = data.transactions[tIndex];
      const newOdenisMebleg = t.odenis_mebleg + newPayment.mebleg;
      const newBorcMebleg = t.mebleg - newOdenisMebleg;

      data.transactions[tIndex] = {
        ...t,
        odenis_mebleg: newOdenisMebleg,
        borc_mebleg: newBorcMebleg,
        status: newBorcMebleg <= 0 ? 'odenildi' : (newOdenisMebleg > 0 ? 'qismen_odenildi' : 'gozleyir')
      };
    }

    saveData();
    return newPayment;
  },

  deletePayment: async (id) => {
    loadData();
    const payment = data.payments.find(p => p.id === id);
    if (payment) {
      const tIndex = data.transactions.findIndex(t => t.id === payment.transaction_id);
      if (tIndex !== -1) {
        const t = data.transactions[tIndex];
        const newOdenisMebleg = t.odenis_mebleg - payment.mebleg;
        const newBorcMebleg = t.mebleg - newOdenisMebleg;

        data.transactions[tIndex] = {
          ...t,
          odenis_mebleg: newOdenisMebleg,
          borc_mebleg: newBorcMebleg,
          status: newBorcMebleg <= 0 ? 'odenildi' : (newOdenisMebleg > 0 ? 'qismen_odenildi' : 'gozleyir')
        };
      }

      data.payments = data.payments.filter(p => p.id !== id);
      saveData();
    }
  },

  getDailySummary: async (date) => {
    loadData();
    const targetDate = date || new Date().toISOString().split('T')[0];
    const todayPayments = data.payments.filter(p => p.tarix.split('T')[0] === targetDate);

    const summary = {};
    todayPayments.forEach(p => {
      if (!summary[p.odenis_usulu]) {
        summary[p.odenis_usulu] = { odenis_usulu: p.odenis_usulu, count: 0, total: 0 };
      }
      summary[p.odenis_usulu].count++;
      summary[p.odenis_usulu].total += p.mebleg;
    });

    return {
      date: targetDate,
      summary: Object.values(summary),
      total: todayPayments.reduce((sum, p) => sum + p.mebleg, 0)
    };
  },

  // ===== SERVICES =====
  getAllServices: async () => {
    loadData();
    return data.services.sort((a, b) => (a.ad || '').localeCompare(b.ad || ''));
  },

  createService: async (svcData) => {
    loadData();
    const newService = {
      id: uuidv4(),
      ad: svcData.ad,
      qiymet: parseFloat(svcData.qiymet) || 0,
      tesvir: svcData.tesvir || ''
    };
    data.services.push(newService);
    saveData();
    return newService;
  },

  updateService: async (id, updateData) => {
    loadData();
    const index = data.services.findIndex(s => s.id === id);
    if (index !== -1) {
      data.services[index] = { ...data.services[index], ...updateData };
      saveData();
      return data.services[index];
    }
    return null;
  },

  deleteService: async (id) => {
    loadData();
    data.services = data.services.filter(s => s.id !== id);
    saveData();
  },

  // ===== REMINDERS =====
  getAllReminders: async (pendingOnly = false) => {
    loadData();
    let reminders = data.reminders.map(r => {
      const t = data.transactions.find(tr => tr.id === r.transaction_id);
      const patient = t ? data.patients.find(p => p.id === t.patient_id) : null;
      return {
        ...r,
        tesvir: t?.tesvir || '',
        borc_mebleg: t?.borc_mebleg || 0,
        ad: patient?.ad || '',
        soyad: patient?.soyad || '',
        telefon: patient?.telefon || ''
      };
    });

    if (pendingOnly) {
      const today = new Date().toISOString().split('T')[0];
      reminders = reminders.filter(r => !r.gonderildi && r.xatirlatma_tarixi <= today);
    }

    return reminders.sort((a, b) => (a.xatirlatma_tarixi || '').localeCompare(b.xatirlatma_tarixi || ''));
  },

  getTodayReminders: async () => {
    loadData();
    const today = new Date().toISOString().split('T')[0];
    return data.reminders
      .filter(r => !r.gonderildi && r.xatirlatma_tarixi <= today)
      .map(r => {
        const t = data.transactions.find(tr => tr.id === r.transaction_id);
        const patient = t ? data.patients.find(p => p.id === t.patient_id) : null;
        return {
          ...r,
          tesvir: t?.tesvir || '',
          borc_mebleg: t?.borc_mebleg || 0,
          son_odenis_tarixi: t?.son_odenis_tarixi || null,
          ad: patient?.ad || '',
          soyad: patient?.soyad || '',
          telefon: patient?.telefon || ''
        };
      });
  },

  getOverduePayments: async () => {
    loadData();
    const today = new Date().toISOString().split('T')[0];
    return data.transactions
      .filter(t => t.son_odenis_tarixi && t.son_odenis_tarixi < today && ['gozleyir', 'qismen_odenildi'].includes(t.status))
      .map(t => {
        const patient = data.patients.find(p => p.id === t.patient_id);
        return {
          ...t,
          ad: patient?.ad || '',
          soyad: patient?.soyad || '',
          telefon: patient?.telefon || ''
        };
      })
      .sort((a, b) => new Date(a.son_odenis_tarixi) - new Date(b.son_odenis_tarixi));
  },

  createReminder: async (remData) => {
    loadData();
    const newReminder = {
      id: uuidv4(),
      transaction_id: remData.transaction_id,
      xatirlatma_tarixi: remData.xatirlatma_tarixi,
      mesaj: remData.mesaj || '',
      gonderildi: false
    };
    data.reminders.push(newReminder);
    saveData();
    return newReminder;
  },

  markReminderSent: async (id) => {
    loadData();
    const index = data.reminders.findIndex(r => r.id === id);
    if (index !== -1) {
      data.reminders[index].gonderildi = true;
      saveData();
    }
  },

  deleteReminder: async (id) => {
    loadData();
    data.reminders = data.reminders.filter(r => r.id !== id);
    saveData();
  },

  // ===== DASHBOARD =====
  getDashboardStats: async () => {
    loadData();
    const transactions = data.transactions;
    const unpaidTransactions = transactions.filter(t => t.status !== 'odenildi');

    return {
      totalPatients: data.patients.length,
      totalDebt: unpaidTransactions.reduce((sum, t) => sum + (t.borc_mebleg || 0), 0),
      totalPaid: transactions.reduce((sum, t) => sum + (t.odenis_mebleg || 0), 0),
      pendingPayments: transactions.filter(t => t.status === 'gozleyir').length,
      overduePayments: transactions.filter(t => t.status === 'gecikdi').length,
      recentTransactions: (await database.getAllTransactions({})).slice(0, 5)
    };
  },

  // ===== REPORTS =====
  getMonthlyReport: async (year, month) => {
    loadData();
    const targetYear = year || new Date().getFullYear();
    const targetMonth = month || (new Date().getMonth() + 1).toString().padStart(2, '0');

    const monthStart = `${targetYear}-${targetMonth}-01`;
    const lastDay = new Date(targetYear, parseInt(targetMonth), 0).getDate();
    const monthEnd = `${targetYear}-${targetMonth}-${lastDay.toString().padStart(2, '0')}`;

    const monthTransactions = data.transactions.filter(t => {
      const date = t.tarix.split('T')[0];
      return date >= monthStart && date <= monthEnd;
    });

    const monthPayments = data.payments.filter(p => {
      const date = p.tarix.split('T')[0];
      return date >= monthStart && date <= monthEnd;
    });

    const paymentsByMethod = {};
    monthPayments.forEach(p => {
      if (!paymentsByMethod[p.odenis_usulu]) {
        paymentsByMethod[p.odenis_usulu] = { odenis_usulu: p.odenis_usulu, count: 0, total: 0 };
      }
      paymentsByMethod[p.odenis_usulu].count++;
      paymentsByMethod[p.odenis_usulu].total += p.mebleg;
    });

    const dailyRevenue = {};
    monthPayments.forEach(p => {
      const day = p.tarix.split('T')[0];
      if (!dailyRevenue[day]) dailyRevenue[day] = 0;
      dailyRevenue[day] += p.mebleg;
    });

    return {
      period: { year: targetYear, month: targetMonth },
      newTransactions: {
        count: monthTransactions.length,
        total: monthTransactions.reduce((sum, t) => sum + t.mebleg, 0)
      },
      receivedPayments: {
        count: monthPayments.length,
        total: monthPayments.reduce((sum, p) => sum + p.mebleg, 0)
      },
      paymentsByMethod: Object.values(paymentsByMethod),
      pendingDebts: {
        count: data.transactions.filter(t => ['gozleyir', 'qismen_odenildi', 'gecikdi'].includes(t.status)).length,
        total: data.transactions
          .filter(t => ['gozleyir', 'qismen_odenildi', 'gecikdi'].includes(t.status))
          .reduce((sum, t) => sum + (t.borc_mebleg || 0), 0)
      },
      dailyRevenue: Object.entries(dailyRevenue).map(([gun, total]) => ({ gun, total })).sort((a, b) => a.gun.localeCompare(b.gun))
    };
  },

  getYearlyReport: async (year) => {
    loadData();
    const targetYear = (year || new Date().getFullYear()).toString();

    const yearPayments = data.payments.filter(p => p.tarix.startsWith(targetYear));

    const monthlyRevenue = {};
    for (let i = 1; i <= 12; i++) {
      const monthStr = i.toString().padStart(2, '0');
      monthlyRevenue[monthStr] = 0;
    }

    yearPayments.forEach(p => {
      const month = p.tarix.substring(5, 7);
      monthlyRevenue[month] += p.mebleg;
    });

    const yearTransactions = data.transactions.filter(t => t.tarix.startsWith(targetYear));
    const yearPatients = data.patients.filter(p => p.yaradilma_tarixi.startsWith(targetYear));

    return {
      year: targetYear,
      monthlyRevenue: Object.entries(monthlyRevenue).map(([ay, gelir]) => ({ ay, gelir })),
      totals: {
        transactions: {
          count: yearTransactions.length,
          total: yearTransactions.reduce((sum, t) => sum + t.mebleg, 0)
        },
        payments: {
          count: yearPayments.length,
          total: yearPayments.reduce((sum, p) => sum + p.mebleg, 0)
        },
        newPatients: { count: yearPatients.length }
      }
    };
  },

  getTopDebtors: async (limit = 10) => {
    const debtors = await database.getDebtors();
    return debtors.slice(0, limit);
  },

  // ===== APPOINTMENTS =====
  getAllAppointments: async (date) => {
    loadData();
    let appointments = data.appointments.map(a => {
      const patient = data.patients.find(p => p.id === a.patient_id);
      return {
        ...a,
        ad: patient?.ad || '',
        soyad: patient?.soyad || '',
        telefon: patient?.telefon || ''
      };
    });

    if (date) {
      appointments = appointments.filter(a => a.tarix === date);
    }

    return appointments.sort((a, b) => {
      if (a.tarix === b.tarix) {
        return (a.saat || '').localeCompare(b.saat || '');
      }
      return a.tarix.localeCompare(b.tarix);
    });
  },

  getAppointmentsByPatient: async (patientId) => {
    loadData();
    return data.appointments
      .filter(a => a.patient_id === patientId)
      .sort((a, b) => {
        if (a.tarix === b.tarix) return (a.saat || '').localeCompare(b.saat || '');
        return b.tarix.localeCompare(a.tarix);
      });
  },

  createAppointment: async (apptData) => {
    loadData();
    const newAppt = {
      id: uuidv4(),
      patient_id: apptData.patient_id,
      tarix: apptData.tarix,
      saat: apptData.saat,
      tesvir: apptData.tesvir || '',
      status: apptData.status || 'planlanib',
      qeyd: apptData.qeyd || '',
      yaradilma_tarixi: new Date().toISOString()
    };
    data.appointments.push(newAppt);
    saveData();
    return newAppt;
  },

  updateAppointment: async (id, updateData) => {
    loadData();
    const index = data.appointments.findIndex(a => a.id === id);
    if (index !== -1) {
      data.appointments[index] = { ...data.appointments[index], ...updateData };
      saveData();
      return data.appointments[index];
    }
    return null;
  },

  deleteAppointment: async (id) => {
    loadData();
    data.appointments = data.appointments.filter(a => a.id !== id);
    saveData();
  },

  // ===== SEARCH =====
  searchAll: async (term) => {
    loadData();
    if (!term || term.length < 2) return { patients: [], transactions: [], appointments: [] };
    const t = term.toLowerCase();

    const patients = data.patients.filter(p =>
      p.ad.toLowerCase().includes(t) ||
      p.soyad.toLowerCase().includes(t) ||
      (p.telefon && p.telefon.includes(t))
    ).slice(0, 20);

    // Get full patient info with debt for matched patients
    const patientResults = patients.map(p => {
      const totalDebt = data.transactions
        .filter(tr => tr.patient_id === p.id && tr.status !== 'odenildi')
        .reduce((sum, tr) => sum + (tr.borc_mebleg || 0), 0);
      const lastTransaction = data.transactions
        .filter(tr => tr.patient_id === p.id)
        .sort((a, b) => new Date(b.tarix) - new Date(a.tarix))[0];
      const upcomingAppt = data.appointments
        .filter(a => a.patient_id === p.id && a.tarix >= new Date().toISOString().split('T')[0])
        .sort((a, b) => a.tarix.localeCompare(b.tarix) || (a.saat || '').localeCompare(b.saat || ''))[0];
      return {
        ...p,
        totalDebt,
        lastTransaction: lastTransaction ? { tesvir: lastTransaction.tesvir, tarix: lastTransaction.tarix } : null,
        upcomingAppointment: upcomingAppt || null
      };
    });

    return { patients: patientResults };
  },

  // Get full patient profile with all history
  getPatientProfile: async (id) => {
    loadData();
    const patient = data.patients.find(p => p.id === id);
    if (!patient) return null;

    const transactions = data.transactions
      .filter(t => t.patient_id === id)
      .sort((a, b) => new Date(b.tarix) - new Date(a.tarix));

    const payments = data.payments
      .filter(p => {
        const t = data.transactions.find(tr => tr.id === p.transaction_id);
        return t && t.patient_id === id;
      })
      .sort((a, b) => new Date(b.tarix) - new Date(a.tarix));

    const appointments = data.appointments
      .filter(a => a.patient_id === id)
      .sort((a, b) => {
        if (a.tarix === b.tarix) return (a.saat || '').localeCompare(b.saat || '');
        return b.tarix.localeCompare(a.tarix);
      });

    const totalDebt = transactions
      .filter(t => t.status !== 'odenildi')
      .reduce((sum, t) => sum + (t.borc_mebleg || 0), 0);

    const totalPaid = transactions
      .reduce((sum, t) => sum + (t.odenis_mebleg || 0), 0);

    return {
      ...patient,
      transactions,
      payments,
      appointments,
      totalDebt,
      totalPaid
    };
  }
};

module.exports = database;
module.exports.createBackup = createBackup;
module.exports.restoreBackup = restoreBackup;
module.exports.listBackups = listBackups;
module.exports.autoBackupIfNeeded = autoBackupIfNeeded;
