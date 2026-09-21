const fs = require('fs');

const earningsFile = 'frontend/src/modules/seller/pages/Earnings.jsx';
let earningsContent = fs.readFileSync(earningsFile, 'utf8');

// replace occurrences of settledBalance with availableBalance
earningsContent = earningsContent.replace(/data\.balances\?\.settledBalance/g, 'data.balances?.availableBalance');
// in case there's data?.balances?.settledBalance
earningsContent = earningsContent.replace(/data\?\.balances\?\.settledBalance/g, 'data?.balances?.availableBalance');

fs.writeFileSync(earningsFile, earningsContent);
console.log('Patched Earnings.jsx');

const withdrawalsFile = 'frontend/src/modules/seller/pages/Withdrawals.jsx';
let withdrawalsContent = fs.readFileSync(withdrawalsFile, 'utf8');

const oldValidation = `        const settled = Number(data?.balances?.settledBalance ?? 0);
        const pending = Math.abs(Number(data?.balances?.pendingPayouts ?? 0));
        const available = Math.max(0, settled - pending);`;

const newValidation = `        const available = Number(data?.balances?.availableBalance ?? 0);`;

withdrawalsContent = withdrawalsContent.replace(oldValidation, newValidation);

fs.writeFileSync(withdrawalsFile, withdrawalsContent);
console.log('Patched Withdrawals.jsx');
