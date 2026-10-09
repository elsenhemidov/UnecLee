/**
 * Lisenziya Generator Tool
 * ========================
 * Bu alət müştərilər üçün lisenziya kodu yaratmaq üçündür.
 * 
 * İstifadə:
 *   node license-generator.js <HARDWARE-ID>
 * 
 * Nümunə:
 *   node license-generator.js 1A2B-3C4D-5E6F-7G8H
 */

const crypto = require('crypto');

// Secret key - license.js ilə EYNİ OLMALIDIR!
const SECRET_KEY = 'HekimDefteri2026SecretKey!@#';

// Generate license key from hardware ID
function generateLicenseKey(hardwareId, type = 'lifetime') {
  const data = `${hardwareId}|${type}|${SECRET_KEY}`;
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  
  // Format as license key
  const key = hash.substring(0, 20).toUpperCase();
  return `HEKIM-${key.substring(0, 5)}-${key.substring(5, 10)}-${key.substring(10, 15)}-${key.substring(15, 20)}`;
}

// Main
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║           HƎKİM DƎFTƎRİ - LİSENZİYA GENERATOR         ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('İstifadə: node license-generator.js <HARDWARE-ID>');
  console.log('');
  console.log('Nümunə:   node license-generator.js 1A2B-3C4D-5E6F-7G8H');
  console.log('');
  console.log('Hardware ID müştərinin proqramında görünür.');
  console.log('');
  process.exit(0);
}

const hardwareId = args[0].toUpperCase();

// Validate hardware ID format
const hardwareIdPattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
if (!hardwareIdPattern.test(hardwareId)) {
  console.error('');
  console.error('❌ Xəta: Hardware ID formatı yanlışdır!');
  console.error('   Düzgün format: XXXX-XXXX-XXXX-XXXX');
  console.error('   Nümunə: 1A2B-3C4D-5E6F-7G8H');
  console.error('');
  process.exit(1);
}

const licenseKey = generateLicenseKey(hardwareId);

console.log('');
console.log('╔════════════════════════════════════════════════════════╗');
console.log('║              LİSENZİYA UĞURLA YARADILDI!               ║');
console.log('╚════════════════════════════════════════════════════════╝');
console.log('');
console.log('  Hardware ID:    ' + hardwareId);
console.log('');
console.log('  ┌─────────────────────────────────────────────────────┐');
console.log('  │  LİSENZİYA KODU:                                    │');
console.log('  │                                                     │');
console.log('  │  ' + licenseKey + '           │');
console.log('  │                                                     │');
console.log('  └─────────────────────────────────────────────────────┘');
console.log('');
console.log('  Bu kodu müştəriyə göndərin.');
console.log('');
