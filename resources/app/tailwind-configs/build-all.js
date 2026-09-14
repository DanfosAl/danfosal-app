// Rebuilds all compiled Tailwind CSS files for www/.
// Run this (npm run build:css) after adding NEW Tailwind classes anywhere in www/,
// since the compiled CSS only contains classes that existed at build time.
const { execSync } = require('child_process');
const path = require('path');

const builds = [
  { config: 'default.config.js', input: 'input.css', out: 'tailwind-default.css' },
  { config: 'index.config.js', input: 'index-input.css', out: 'tailwind-index.css' },
  { config: 'customer-portal.config.js', input: 'input.css', out: 'tailwind-customer-portal.css' },
  { config: 'products.config.js', input: 'input.css', out: 'tailwind-products.css' },
  { config: 'analytics.config.js', input: 'input.css', out: 'tailwind-analytics.css' },
  { config: 'online-orders.config.js', input: 'input.css', out: 'tailwind-online-orders.css' },
  { config: 'store-sales.config.js', input: 'input.css', out: 'tailwind-store-sales.css' },
];

const cwd = __dirname;
for (const b of builds) {
  console.log(`Building ${b.out}...`);
  execSync(
    `npx tailwindcss -c "${b.config}" -i "${b.input}" -o "../www/css/${b.out}" --minify`,
    { cwd, stdio: 'inherit' }
  );
}
console.log('All Tailwind builds complete.');
