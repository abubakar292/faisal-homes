const fs = require('fs');
let content = fs.readFileSync('src/pages/payments/ReceiveDownPayment.tsx', 'utf8');

// 1. Add writeBatch imports
if (!content.includes('writeBatch')) {
  content = content.replace(
    "import { generateReceiptNumber",
    "import { db } from '../../firebase/config';\nimport { writeBatch, doc, collection } from 'firebase/firestore';\nimport { generateReceiptNumber"
  );
}

// 2. Rewrite submit logic
const submitRegex = /      await addDocument\('downPaymentTransactions', tx\);[\s\S]*?downPaymentStatus:\   newStatus,\n      }\);/;
const newSubmit = `      const batch = writeBatch(db);
      
      const txRef = doc(collection(db, 'downPaymentTransactions'));
      batch.set(txRef, { ...tx, id: txRef.id });

      const newReceived = receivedSoFar + amountNum;
      const newPending  = Math.max(0, remainingRequired - newReceived);
      const newStatus: Sale['downPaymentStatus'] = newPending === 0 ? 'complete' : 'partial';

      const saleRef = doc(db, 'sales', saleId);
      batch.update(saleRef, {
        downPaymentReceived: newReceived,
        downPaymentStatus:   newStatus,
      });

      await batch.commit();`;
content = content.replace(submitRegex, newSubmit);

fs.writeFileSync('src/pages/payments/ReceiveDownPayment.tsx', content, 'utf8');
console.log("Done");
