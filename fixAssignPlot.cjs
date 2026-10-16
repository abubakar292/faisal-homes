const fs = require('fs');

let content = fs.readFileSync('src/pages/sales/AssignPlot.tsx', 'utf8');

// 1. Move On-Possession ABOVE Installment Plan
const onPossRegex = /        {\/\* ── On-Possession Details ── \*\/}[\s\S]*?(?=        {\/\* ── Dealer Information)/;
const matchPoss = content.match(onPossRegex);
if (matchPoss) {
  content = content.replace(matchPoss[0], '');
  const instPlanStr = '        {/* ── Custom Installment Plan ── */}';
  content = content.replace(instPlanStr, matchPoss[0] + '\n' + instPlanStr);
} else {
  console.log("Could not find On-Possession section.");
}

// 2. Rewrite validate
const valRegex = /  const validate = \(\) => {[\s\S]*?return Object.keys\(e\)\.length === 0;\n  };\n/;
const newValidate = `  const validate = () => {
    const e: Record<string, string> = {};
    if (!customerId)            e.customerId  = 'Customer is required';
    if (!plotId)                e.plotId      = 'Plot is required';
    if (!saleDate)              e.saleDate    = 'Sale date is required';
    if (totalPrice <= 0)        e.totalPrice  = 'Total price must be > 0';
    
    if (downPaymentAmount < bookingPaid) e.downPaymentAmount = 'Down payment cannot be less than booking paid';
    if (downPaymentAmount > finalPrice) e.downPaymentAmount = 'Down payment cannot exceed final price';

    if (rows.length === 0)      e.rows        = 'Add at least one installment row';
    if (rows.some(r => r.months <= 0 || r.monthlyAmount <= 0))
      e.rows = 'All installment rows must have valid months and amount';
    setErrors(e);
    return Object.keys(e).length === 0;
  };\n`;
content = content.replace(valRegex, newValidate);

// 3. Rewrite generateInstallments
const genRegex = /    let datePointer = saleDateObj;\n    let monthCounter = 0;\n\n    for \(const row of rows\) {[\s\S]*?(?=    return allInsts;\n  };)/;
const newGen = `    let monthCounter = 0;

    for (const row of rows) {
      for (let m = 0; m < row.months; m++) {
        monthCounter++;
        const dueDate = addMonths(saleDateObj, monthCounter);
        
        // Push normal monthly payment
        allInsts.push({
          receiptNumber:     '',
          saleId,
          customerId,
          plotId,
          installmentNumber: instNum++,
          totalInstallments: totalInsts,
          type:              'monthly',
          dueDate:           new Date(dueDate),
          amountDue:         row.monthlyAmount,
          amountPaid: 0,
          paymentDate:       null,
          paymentMethod:     '',
          bankName:          '',
          chequeNumber:      '',
          status:            'pending',
          notes:             '',
          createdAt:         new Date(),
        });

        // ALSO push semi-annual payment on 6th month
        if (semiAnnualEnabled && monthCounter % 6 === 0) {
          allInsts.push({
            receiptNumber:     '',
            saleId,
            customerId,
            plotId,
            installmentNumber: instNum++,
            totalInstallments: totalInsts,
            type:              'semi_annual',
            dueDate:           new Date(dueDate),
            amountDue:         semiAnnualAmount,
            amountPaid: 0,
            paymentDate:       null,
            paymentMethod:     '',
            bankName:          '',
            chequeNumber:      '',
            status:            'pending',
            notes:             \`Semi-Annual Payment \${Math.floor(monthCounter/6)}\`,
            createdAt:         new Date(),
          });
        }
      }
    }
`;
content = content.replace(genRegex, newGen);

// 4. Update handleSubmit with writeBatch
const submitRegex = /      const saleDocRef = await addDocument\('sales', newSale\);[\s\S]*?(?=      toast\.success)/;
const newSubmit = `      const plotDoc = await getDocument('plots', plotId);
      if (plotDoc?.status !== 'available' && plotDoc?.status !== 'booked') {
         toast.error('This plot is no longer available');
         setSaving(false);
         return;
      }
      if (plotDoc?.status === 'booked' && plotDoc?.bookingId && matchedBooking && plotDoc.bookingId !== matchedBooking.id) {
         toast.error('This plot is booked by another customer');
         setSaving(false);
         return;
      }
      
      const batch = writeBatch(db);
      
      // 1. Sale Doc
      const saleRef = doc(collection(db, 'sales'));
      batch.set(saleRef, { ...newSale, id: saleRef.id, createdAt: new Date() });
      
      // 2. Installments
      for (const inst of generatedInstallments) {
        const instRef = doc(collection(db, 'installments'));
        batch.set(instRef, { ...inst, saleId: saleRef.id, id: instRef.id });
      }
      
      // 3. Plot Update
      const plotRef = doc(db, 'plots', plotId);
      batch.update(plotRef, { status: 'sold', customerId });
      
      // 4. Dealer Ledger & Commission
      if (selectedDealerId && dealerCommissionAmt > 0) {
        const ledgerRef = doc(collection(db, 'dealer_ledger'));
        batch.set(ledgerRef, {
          id: ledgerRef.id,
          dealerId: selectedDealerId,
          date: new Date(saleDate),
          type: 'commission_earned',
          amount: dealerCommissionAmt,
          description: \`Commission on Plot \${plot?.plotNumber} (Sale \${saleRef.id})\`,
          saleId: saleRef.id,
          createdAt: new Date(),
        });
        
        if (dealerCommissionStatus === 'paid') {
          const ledgerPaidRef = doc(collection(db, 'dealer_ledger'));
          batch.set(ledgerPaidRef, {
            id: ledgerPaidRef.id,
            dealerId: selectedDealerId,
            date: new Date(saleDate),
            type: 'payment_made',
            amount: dealerCommissionAmt,
            description: \`Commission Paid for Plot \${plot?.plotNumber}\`,
            saleId: saleRef.id,
            createdAt: new Date(),
          });
        }
      }
      
      await batch.commit();
      
      const saleDocRef = { id: saleRef.id };
`;
content = content.replace(submitRegex, newSubmit);

fs.writeFileSync('src/pages/sales/AssignPlot.tsx', content, 'utf8');
console.log("Done");
