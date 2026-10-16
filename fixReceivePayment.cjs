const fs = require('fs');
let content = fs.readFileSync('src/pages/payments/ReceivePayment.tsx', 'utf8');

// 1. Add firestore batch imports
if (!content.includes('writeBatch')) {
  content = content.replace(
    "import { generateReceiptNumber",
    "import { db } from '../../firebase/config';\nimport { writeBatch, doc } from 'firebase/firestore';\nimport { generateReceiptNumber"
  );
}

// 2. Fix sorting in useEffect
const sortRegex = /\.sort\(\(a, b\) => a\.installmentNumber - b\.installmentNumber\);/;
content = content.replace(sortRegex, `.sort((a, b) => {
        const dateA = new Date(a.dueDate).getTime();
        const dateB = new Date(b.dueDate).getTime();
        if (dateA !== dateB) return dateA - dateB;
        if (a.type === 'monthly' && b.type !== 'monthly') return -1;
        if (b.type === 'monthly' && a.type !== 'monthly') return 1;
        return a.installmentNumber - b.installmentNumber;
      });`);

// 3. Fix defaulting amount
content = content.replace(
  /setAmountPaid\(String\(next\.amountDue\)\);/,
  `setAmountPaid(String(next.amountDue - (next.amountPaid || 0)));`
);
content = content.replace(
  /setAmountPaid\(String\(inst\.amountDue\)\);/,
  `setAmountPaid(String(inst.amountDue - (inst.amountPaid || 0)));`
);

// 4. Fix paidSoFar
const paidSoFarRegex = /const paidSoFar = allInsts\s*\.filter\(i => i\.saleId === saleId && i\.status === 'paid'\)\s*\.reduce\(\(s, i\) => s \+ \(i\.amountPaid \|\| 0\), 0\);/;
content = content.replace(paidSoFarRegex, `const paidSoFar = allInsts
    .filter(i => i.saleId === saleId && i.id !== installmentId) // exclude current so we can just add the new total or current payment cleanly
    .reduce((s, i) => s + (i.amountPaid || 0), 0) + (selectedInstallment?.amountPaid || 0); // Include what was already paid on THIS installment before this transaction`);

// 5. Rewrite submit logic
const submitRegex = /      await updateDocument\('installments', installmentId, {[\s\S]*?setAmountPaid\(''\);/;
const newSubmit = `      const currentAmountPaid = Number(amountPaid);
      const outstanding = selectedInstallment.amountDue - (selectedInstallment.amountPaid || 0);
      
      if (currentAmountPaid > outstanding) {
        toast.error(\`Cannot pay more than outstanding amount (Rs. \${formatCurrency(outstanding)})\`);
        setLoading(false);
        return;
      }

      const totalAmountPaidNow = (selectedInstallment.amountPaid || 0) + currentAmountPaid;
      const isFullyPaid = totalAmountPaidNow >= selectedInstallment.amountDue;
      const newStatus = isFullyPaid ? 'paid' : 'partial';

      const batch = writeBatch(db);

      // Update Installment
      const instRef = doc(db, 'installments', installmentId);
      batch.update(instRef, {
        status:        newStatus,
        amountPaid:    totalAmountPaidNow,
        paymentDate:   paidDate,
        paymentMethod,
        bankName,
        chequeNumber,
        notes,
        receiptNumber,
      });

      // Update Sale
      const newRemaining = Math.max(0, selectedSale.remainingAmount - currentAmountPaid);
      const saleUpdates: Record<string, unknown> = { remainingAmount: newRemaining };
      if (possessionMode) saleUpdates.possessionGiven = true;
      if (newRemaining === 0) saleUpdates.status = 'completed';
      const saleRef = doc(db, 'sales', saleId);
      batch.update(saleRef, saleUpdates);

      await batch.commit();

      const updatedInst: Installment = {
        ...selectedInstallment,
        status:        newStatus,
        amountPaid:    totalAmountPaidNow,
        paymentDate:   paidDate,
        paymentMethod: paymentMethod as Installment['paymentMethod'],
        bankName,
        chequeNumber,
        receiptNumber,
      };

      setLastInstallment(updatedInst);
      setLastSale({ ...selectedSale, remainingAmount: newRemaining });
      setLastCustomer(selectedCustomer || null);
      setLastPlot(selectedPlot || null);
      setShowPrint(true);

      toast.success(\`✅ Payment recorded! Receipt: \${receiptNumber}\`);

      // Refresh installments
      const refreshed = await getCollection<Installment>('installments');
      setAllInsts(refreshed);
      setSales(prev => prev.map(s =>
        s.id === saleId ? { ...s, remainingAmount: newRemaining, status: newRemaining === 0 ? 'completed' : s.status } : s
      ));
      setInstallmentId('');
      setAmountPaid('');`;
content = content.replace(submitRegex, newSubmit);

// 6. Fix print logic
const printRegex = /const html = generatePaymentReceipt\(lastInstallment, lastCustomer, lastPlot, company, lastSale\.remainingAmount, paidSoFar \+ \(lastInstallment\.amountPaid \|\| 0\)\);/;
content = content.replace(printRegex, `const html = generatePaymentReceipt(lastInstallment, lastCustomer, lastPlot, company, lastSale.remainingAmount, paidSoFar + Number(amountPaid)); // paidSoFar already includes prev payments on this inst`);

// Also fix the dropdown display text to show outstanding instead of full due
// `#{i.installmentNumber} — Due: {formatDate(i.dueDate)} — {formatCurrency(i.amountDue)}`
const dropdownRegex = /#{i\.installmentNumber} — Due: \{formatDate\(i\.dueDate\)\} — \{formatCurrency\(i\.amountDue\)\}/;
content = content.replace(dropdownRegex, `#{i.installmentNumber} — Due: {formatDate(i.dueDate)} — {formatCurrency(i.amountDue - (i.amountPaid || 0))} outstanding`);

fs.writeFileSync('src/pages/payments/ReceivePayment.tsx', content, 'utf8');
console.log("Done");
