const fs = require('fs');

const file = 'd:/Faisal Homes/faisal-homes/src/pages/payments/ReceivePayment.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('useSearchParams')) {
  content = content.replace(
    /import \{ useNavigate, Link \} from 'react-router-dom';/,
    'import { useNavigate, Link, useSearchParams } from \'react-router-dom\';'
  );

  content = content.replace(
    /const navigate = useNavigate\(\);/,
    'const navigate = useNavigate();\n  const [searchParams] = useSearchParams();'
  );

  content = content.replace(
    /if \(comp\) setCompany\(comp\);\n\s*\}\);\n\s*\}, \[\]\);/,
    `if (comp) setCompany(comp);

      const qCust = searchParams.get('customerId');
      const qSale = searchParams.get('saleId');
      const qInst = searchParams.get('installmentId');
      if (qCust) setCustomerId(qCust);
      if (qSale) setSaleId(qSale);
      if (qInst) setInstallmentId(qInst);
    });
  }, [searchParams]);`
  );

  fs.writeFileSync(file, content, 'utf8');
  console.log('Updated ReceivePayment.tsx');
} else {
  console.log('ReceivePayment.tsx already updated');
}
