const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');
const db = new Database('../data/localcreativeflow.db');

const user = db.prepare('SELECT * FROM users WHERE email = ?').get('geramonnn@gmail.com');
console.log('User found:', !!user);

if (user) {
  console.log('Email:', user.email);
  console.log('Name:', user.name);
  console.log('Is admin:', user.is_admin);
  console.log('Password hash length:', user.password_hash.length);
  
  // Test common passwords
  const testPasswords = ['admin123', 'password', '123456', 'admin', 'geramonnn'];
  
  testPasswords.forEach(async (pwd) => {
    const isValid = await bcrypt.compare(pwd, user.password_hash);
    console.log(`Password '${pwd}' matches:`, isValid);
  });
}

db.close();
