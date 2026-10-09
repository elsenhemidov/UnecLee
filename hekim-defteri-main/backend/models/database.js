import { JSONFilePreset } from 'lowdb/node';
import { v4 as uuidv4 } from 'uuid';

// Default data structure
const defaultData = {
  patients: [],
  services: [],
  transactions: [],
  payments: [],
  reminders: [],
  appointments: []
};

// Initialize database
const db = await JSONFilePreset('hekim.json', defaultData);

// Helper functions to mimic SQL-like operations
export const database = {
  // Patients
  getAllPatients: (search = '') => {
    let patients = db.data.patients;
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

  getPatientById: (id) => {
    return db.data.patients.find(p => p.id === id);
  },

  createPatient: async (patient) => {
    const newPatient = {
      id: uuidv4(),
      ...patient,
      yaradilma_tarixi: new Date().toISOString(),
      yenilenme_tarixi: new Date().toISOString()
    };
    db.data.patients.push(newPatient);
    await db.write();
    return newPatient;
  },

  updatePatient: async (id, data) => {
    const index = db.data.patients.findIndex(p => p.id === id);
    if (index !== -1) {
      db.data.patients[index] = { 
        ...db.data.patients[index], 
        ...data, 
        yenilenme_tarixi: new Date().toISOString() 
      };
      await db.write();
      return db.data.patients[index];
    }
    return null;
  },

  deletePatient: async (id) => {
    db.data.patients = db.data.patients.filter(p => p.id !== id);
    db.data.transactions = db.data.transactions.filter(t => t.patient_id !== id);
    await db.write();
  },

  getPatientTransactions: (patientId) => {
    return db.data.transactions
      .filter(t => t.patient_id === patientId)
      .sort((a, b) => new Date(b.tarix) - new Date(a.tarix));
  },

  getPatientTotalDebt: (patientId) => {
    return db.data.transactions
      .filter(t => t.patient_id === patientId && t.status !== 'odenildi')
      .reduce((sum, t) => sum + (t.borc_mebleg || 0), 0);
  },

  // Transactions
  getAllTransactions: (filters = {}) => {
    let transactions = db.data.transactions.map(t => {
      const patient = db.data.patients.find(p => p.id === t.patient_id);
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

  getTransactionById: (id) => {
    const t = db.data.transactions.find(t => t.id === id);
    if (t) {
      const patient = db.data.patients.find(p => p.id === t.patient_id);
      return {
        ...t,
        ad: patient?.ad || '',
        soyad: patient?.soyad || '',
        telefon: patient?.telefon || ''
      };
    }
    return null;
  },

  createTransaction: async (data) => {
    const mebleg = parseFloat(data.mebleg) || 0;
    const odenisMebleg = parseFloat(data.odenis_mebleg) || 0;
    const borcMebleg = mebleg - odenisMebleg;

    const newTransaction = {
      id: uuidv4(),
      patient_id: data.patient_id,
      service_id: data.service_id || null,
      tesvir: data.tesvir,
      mebleg: mebleg,
      odenis_mebleg: odenisMebleg,
      borc_mebleg: borcMebleg,
      tarix: new Date().toISOString(),
      son_odenis_tarixi: data.son_odenis_tarixi || null,
      status: odenisMebleg >= mebleg ? 'odenildi' : (odenisMebleg > 0 ? 'qismen_odenildi' : 'gozleyir'),
      xatirlatma_aktiv: true
    };

    db.data.transactions.push(newTransaction);

    // İlkin ödəniş varsa, ödənişlər cədvəlinə də yaz
    if (odenisMebleg > 0) {
      const initialPayment = {
        id: uuidv4(),
        transaction_id: newTransaction.id,
        mebleg: odenisMebleg,
        odenis_usulu: data.odenis_usulu || 'nagd',
        qeyd: 'İlkin ödəniş',
        tarix: new Date().toISOString()
      };
      db.data.payments.push(initialPayment);
    }

    await db.write();
    return newTransaction;
  },

  updateTransaction: async (id, data) => {
    const index = db.data.transactions.findIndex(t => t.id === id);
    if (index !== -1) {
      const current = db.data.transactions[index];
      const mebleg = parseFloat(data.mebleg) || current.mebleg;
      const borcMebleg = mebleg - current.odenis_mebleg;
      
      db.data.transactions[index] = {
        ...current,
        tesvir: data.tesvir || current.tesvir,
        mebleg: mebleg,
        borc_mebleg: borcMebleg,
        son_odenis_tarixi: data.son_odenis_tarixi !== undefined ? data.son_odenis_tarixi : current.son_odenis_tarixi,
        xatirlatma_aktiv: data.xatirlatma_aktiv !== undefined ? data.xatirlatma_aktiv : current.xatirlatma_aktiv
      };
      await db.write();
      return db.data.transactions[index];
    }
    return null;
  },

  deleteTransaction: async (id) => {
    db.data.transactions = db.data.transactions.filter(t => t.id !== id);
    db.data.payments = db.data.payments.filter(p => p.transaction_id !== id);
    await db.write();
  },

  getDebtors: () => {
    const debtorMap = {};
    
    db.data.transactions
      .filter(t => t.status !== 'odenildi')
      .forEach(t => {
        if (!debtorMap[t.patient_id]) {
          const patient = db.data.patients.find(p => p.id === t.patient_id);
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

  // Payments
  getAllPayments: (filters = {}) => {
    let payments = db.data.payments.map(p => {
      const t = db.data.transactions.find(tr => tr.id === p.transaction_id);
      const patient = t ? db.data.patients.find(pt => pt.id === t.patient_id) : null;
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

  createPayment: async (data) => {
    const newPayment = {
      id: uuidv4(),
      transaction_id: data.transaction_id,
      mebleg: parseFloat(data.mebleg) || 0,
      odenis_usulu: data.odenis_usulu || 'nagd',
      qeyd: data.qeyd || '',
      tarix: new Date().toISOString()
    };

    db.data.payments.push(newPayment);

    // Update transaction
    const tIndex = db.data.transactions.findIndex(t => t.id === data.transaction_id);
    if (tIndex !== -1) {
      const t = db.data.transactions[tIndex];
      const newOdenisMebleg = t.odenis_mebleg + newPayment.mebleg;
      const newBorcMebleg = t.mebleg - newOdenisMebleg;
      
      db.data.transactions[tIndex] = {
        ...t,
        odenis_mebleg: newOdenisMebleg,
        borc_mebleg: newBorcMebleg,
        status: newBorcMebleg <= 0 ? 'odenildi' : (newOdenisMebleg > 0 ? 'qismen_odenildi' : 'gozleyir')
      };
    }

    await db.write();
    return newPayment;
  },

  updatePayment: async (id, data) => {
    const index = db.data.payments.findIndex(p => p.id === id);
    if (index !== -1) {
      const oldPayment = db.data.payments[index];
      const oldMebleg = oldPayment.mebleg;
      const newMebleg = parseFloat(data.mebleg) || oldMebleg;
      const diff = newMebleg - oldMebleg;

      db.data.payments[index] = {
        ...oldPayment,
        mebleg: newMebleg,
        odenis_usulu: data.odenis_usulu || oldPayment.odenis_usulu,
        qeyd: data.qeyd !== undefined ? data.qeyd : oldPayment.qeyd
      };

      // Update transaction totals
      if (diff !== 0) {
        const tIndex = db.data.transactions.findIndex(t => t.id === oldPayment.transaction_id);
        if (tIndex !== -1) {
          const t = db.data.transactions[tIndex];
          const newOdenisMebleg = t.odenis_mebleg + diff;
          const newBorcMebleg = t.mebleg - newOdenisMebleg;
          db.data.transactions[tIndex] = {
            ...t,
            odenis_mebleg: newOdenisMebleg,
            borc_mebleg: newBorcMebleg,
            status: newBorcMebleg <= 0 ? 'odenildi' : (newOdenisMebleg > 0 ? 'qismen_odenildi' : 'gozleyir')
          };
        }
      }

      await db.write();
      return db.data.payments[index];
    }
    return null;
  },

  deletePayment: async (id) => {
    const payment = db.data.payments.find(p => p.id === id);
    if (payment) {
      // Revert payment from transaction
      const tIndex = db.data.transactions.findIndex(t => t.id === payment.transaction_id);
      if (tIndex !== -1) {
        const t = db.data.transactions[tIndex];
        const newOdenisMebleg = t.odenis_mebleg - payment.mebleg;
        const newBorcMebleg = t.mebleg - newOdenisMebleg;
        
        db.data.transactions[tIndex] = {
          ...t,
          odenis_mebleg: newOdenisMebleg,
          borc_mebleg: newBorcMebleg,
          status: newBorcMebleg <= 0 ? 'odenildi' : (newOdenisMebleg > 0 ? 'qismen_odenildi' : 'gozleyir')
        };
      }

      db.data.payments = db.data.payments.filter(p => p.id !== id);
      await db.write();
    }
  },

  getDailySummary: (date) => {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const todayPayments = db.data.payments.filter(p => p.tarix.split('T')[0] === targetDate);
    
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

  // Appointments
  getAllAppointments: (date) => {
    if (!db.data.appointments) db.data.appointments = [];
    let appointments = db.data.appointments.map(a => {
      const patient = db.data.patients.find(p => p.id === a.patient_id);
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
    return appointments.sort((a, b) => (a.saat || '').localeCompare(b.saat || ''));
  },

  getAppointmentById: (id) => {
    if (!db.data.appointments) db.data.appointments = [];
    return db.data.appointments.find(a => a.id === id);
  },

  createAppointment: async (data) => {
    if (!db.data.appointments) db.data.appointments = [];
    const newAppt = {
      id: uuidv4(),
      patient_id: data.patient_id,
      tarix: data.tarix,
      saat: data.saat,
      tesvir: data.tesvir || '',
      qeyd: data.qeyd || '',
      status: data.status || 'planlanib',
      yaradilma_tarixi: new Date().toISOString()
    };
    db.data.appointments.push(newAppt);
    await db.write();
    return newAppt;
  },

  updateAppointment: async (id, data) => {
    if (!db.data.appointments) db.data.appointments = [];
    const index = db.data.appointments.findIndex(a => a.id === id);
    if (index !== -1) {
      db.data.appointments[index] = {
        ...db.data.appointments[index],
        ...data,
        id: db.data.appointments[index].id,
        patient_id: db.data.appointments[index].patient_id
      };
      await db.write();
      return db.data.appointments[index];
    }
    return null;
  },

  deleteAppointment: async (id) => {
    if (!db.data.appointments) db.data.appointments = [];
    db.data.appointments = db.data.appointments.filter(a => a.id !== id);
    await db.write();
  },

  // Services
  getAllServices: () => {
    return db.data.services.sort((a, b) => a.ad.localeCompare(b.ad));
  },

  createService: async (data) => {
    const newService = {
      id: uuidv4(),
      ad: data.ad,
      qiymet: parseFloat(data.qiymet) || 0,
      tesvir: data.tesvir || ''
    };
    db.data.services.push(newService);
    await db.write();
    return newService;
  },

  updateService: async (id, data) => {
    const index = db.data.services.findIndex(s => s.id === id);
    if (index !== -1) {
      db.data.services[index] = { ...db.data.services[index], ...data };
      await db.write();
      return db.data.services[index];
    }
    return null;
  },

  deleteService: async (id) => {
    db.data.services = db.data.services.filter(s => s.id !== id);
    await db.write();
  },

  // Reminders
  getAllReminders: (pendingOnly = false) => {
    let reminders = db.data.reminders.map(r => {
      const t = db.data.transactions.find(tr => tr.id === r.transaction_id);
      const patient = t ? db.data.patients.find(p => p.id === t.patient_id) : null;
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
    
    return reminders.sort((a, b) => a.xatirlatma_tarixi.localeCompare(b.xatirlatma_tarixi));
  },

  getTodayReminders: () => {
    const today = new Date().toISOString().split('T')[0];
    return db.data.reminders
      .filter(r => !r.gonderildi && r.xatirlatma_tarixi <= today)
      .map(r => {
        const t = db.data.transactions.find(tr => tr.id === r.transaction_id);
        const patient = t ? db.data.patients.find(p => p.id === t.patient_id) : null;
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

  getOverduePayments: () => {
    const today = new Date().toISOString().split('T')[0];
    return db.data.transactions
      .filter(t => t.son_odenis_tarixi && t.son_odenis_tarixi < today && ['gozleyir', 'qismen_odenildi'].includes(t.status))
      .map(t => {
        const patient = db.data.patients.find(p => p.id === t.patient_id);
        return {
          ...t,
          ad: patient?.ad || '',
          soyad: patient?.soyad || '',
          telefon: patient?.telefon || ''
        };
      })
      .sort((a, b) => new Date(a.son_odenis_tarixi) - new Date(b.son_odenis_tarixi));
  },

  createReminder: async (data) => {
    const newReminder = {
      id: uuidv4(),
      transaction_id: data.transaction_id,
      xatirlatma_tarixi: data.xatirlatma_tarixi,
      mesaj: data.mesaj || '',
      gonderildi: false
    };
    db.data.reminders.push(newReminder);
    await db.write();
    return newReminder;
  },

  markReminderSent: async (id) => {
    const index = db.data.reminders.findIndex(r => r.id === id);
    if (index !== -1) {
      db.data.reminders[index].gonderildi = true;
      await db.write();
    }
  },

  deleteReminder: async (id) => {
    db.data.reminders = db.data.reminders.filter(r => r.id !== id);
    await db.write();
  },

  // Dashboard
  getDashboardStats: () => {
    const transactions = db.data.transactions;
    const unpaidTransactions = transactions.filter(t => t.status !== 'odenildi');
    
    return {
      totalPatients: db.data.patients.length,
      totalDebt: unpaidTransactions.reduce((sum, t) => sum + (t.borc_mebleg || 0), 0),
      totalPaid: transactions.reduce((sum, t) => sum + (t.odenis_mebleg || 0), 0),
      pendingPayments: transactions.filter(t => t.status === 'gozleyir').length,
      overduePayments: transactions.filter(t => t.status === 'gecikdi').length,
      recentTransactions: database.getAllTransactions({}).slice(0, 5)
    };
  },

  // Reports
  getMonthlyReport: (year, month) => {
    const targetYear = year || new Date().getFullYear();
    const targetMonth = month || (new Date().getMonth() + 1).toString().padStart(2, '0');
    
    const monthStart = `${targetYear}-${targetMonth}-01`;
    const lastDay = new Date(targetYear, parseInt(targetMonth), 0).getDate();
    const monthEnd = `${targetYear}-${targetMonth}-${lastDay.toString().padStart(2, '0')}`;

    const monthTransactions = db.data.transactions.filter(t => {
      const date = t.tarix.split('T')[0];
      return date >= monthStart && date <= monthEnd;
    });

    const monthPayments = db.data.payments.filter(p => {
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

    // Daily revenue
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
        count: db.data.transactions.filter(t => ['gozleyir', 'qismen_odenildi', 'gecikdi'].includes(t.status)).length,
        total: db.data.transactions
          .filter(t => ['gozleyir', 'qismen_odenildi', 'gecikdi'].includes(t.status))
          .reduce((sum, t) => sum + (t.borc_mebleg || 0), 0)
      },
      dailyRevenue: Object.entries(dailyRevenue).map(([gun, total]) => ({ gun, total })).sort((a, b) => a.gun.localeCompare(b.gun))
    };
  },

  getYearlyReport: (year) => {
    const targetYear = (year || new Date().getFullYear()).toString();
    
    const yearPayments = db.data.payments.filter(p => p.tarix.startsWith(targetYear));
    
    const monthlyRevenue = {};
    for (let i = 1; i <= 12; i++) {
      const monthStr = i.toString().padStart(2, '0');
      monthlyRevenue[monthStr] = 0;
    }
    
    yearPayments.forEach(p => {
      const month = p.tarix.substring(5, 7);
      monthlyRevenue[month] += p.mebleg;
    });

    const yearTransactions = db.data.transactions.filter(t => t.tarix.startsWith(targetYear));
    const yearPatients = db.data.patients.filter(p => p.yaradilma_tarixi.startsWith(targetYear));

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

  getTopDebtors: (limit = 10) => {
    return database.getDebtors().slice(0, limit);
  },

  // Update overdue status
  updateOverdueStatus: async () => {
    const today = new Date().toISOString().split('T')[0];
    let updated = false;
    
    db.data.transactions.forEach((t, index) => {
      if (t.son_odenis_tarixi && t.son_odenis_tarixi < today && ['gozleyir', 'qismen_odenildi'].includes(t.status)) {
        db.data.transactions[index].status = 'gecikdi';
        updated = true;
      }
    });
    
    if (updated) await db.write();
  }
};

export default database;
