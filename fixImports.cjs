const fs = require('fs');

const files = [
  'src/components/layout/Sidebar.tsx',
  'src/pages/bookings/NewBooking.tsx',
  'src/pages/Login.tsx',
  'src/pages/Register.tsx'
];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  content = content.replace(/import \{ Logo \} from/g, 'import Logo from');
  fs.writeFileSync(f, content, 'utf8');
});
