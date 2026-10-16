const fs = require('fs');
let types = fs.readFileSync('src/types/index.ts', 'utf8');
types = types.replace(/export type InstallmentStatus =.*/g, "export type InstallmentStatus = 'pending' | 'paid' | 'overdue' | 'upcoming' | 'partial' | 'cancelled';");
fs.writeFileSync('src/types/index.ts', types, 'utf8');
