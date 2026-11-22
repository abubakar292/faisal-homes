'use strict';
// Amount in words for receipts. Supports international (million) or South Asian (lakh/crore) style.
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below1000(n) {
  const out = [];
  if (n >= 100) { out.push(`${ONES[Math.floor(n / 100)]} Hundred`); n %= 100; }
  if (n >= 20) { out.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '')); } else if (n > 0) out.push(ONES[n]);
  return out.join(' ');
}
function intToWords(n, style) {
  if (n === 0) return 'Zero';
  const parts = [];
  if (style === 'lakh') {
    const units = [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand']];
    for (const [val, name] of units) {
      if (n >= val) {
        const q = Math.floor(n / val);
        parts.push(`${q >= 1000 ? intToWords(q, style) : below1000(q)} ${name}`);
        n %= val;
      }
    }
  } else {
    const units = [[1e12, 'Trillion'], [1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']];
    for (const [val, name] of units) {
      if (n >= val) { parts.push(`${below1000(Math.floor(n / val))} ${name}`); n %= val; }
    }
  }
  if (n > 0) parts.push(below1000(n));
  return parts.join(' ');
}
function amountInWords(value, style = 'intl') {
  const paisa = Math.round(Number(value) * 100);
  const rupees = Math.floor(paisa / 100);
  const p = paisa % 100;
  let s = `Rupees ${intToWords(rupees, style)}`;
  if (p) s += ` and ${intToWords(p, style)} Paisa`;
  return `${s} Only`;
}
module.exports = { amountInWords };
