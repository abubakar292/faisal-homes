const fs = require('fs');

let register = fs.readFileSync('src/pages/Register.tsx', 'utf8');
register = register.replace(/role:\s*'staff',/, "role: 'owner',");
fs.writeFileSync('src/pages/Register.tsx', register);

let auth = fs.readFileSync('src/contexts/AuthContext.tsx', 'utf8');
auth = auth.replace(/role:\s*'staff',/, "role: 'owner',");
fs.writeFileSync('src/contexts/AuthContext.tsx', auth);

console.log('Fixed auth');
