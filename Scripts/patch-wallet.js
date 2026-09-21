const fs = require('fs');

// Fix ProfilePage.jsx
const profileFile = 'frontend/src/modules/customer/pages/ProfilePage.jsx';
let profileContent = fs.readFileSync(profileFile, 'utf8');

profileContent = profileContent.replace(
  '<MenuItem icon={Wallet} label="My Wallet" rightText="₹250" path="/wallet" />',
  '<MenuItem icon={Wallet} label="My Wallet" rightText={`₹${user?.walletBalance || 0}`} path="/wallet" />'
);

fs.writeFileSync(profileFile, profileContent);
console.log('patched ProfilePage.jsx');

// Fix WalletPage.jsx
const walletFile = 'frontend/src/modules/customer/pages/WalletPage.jsx';
let walletContent = fs.readFileSync(walletFile, 'utf8');

const targetBlock = `                const [profileRes, ordersRes] = await Promise.all([
                    customerApi.getProfile(),
                    customerApi.getMyOrders(),
                ]);
                const profile = profileRes.data?.result ?? profileRes.data?.data ?? profileRes.data;
                const rawOrders = ordersRes.data?.results ?? ordersRes.data?.result ?? [];
                const orders = Array.isArray(rawOrders) ? rawOrders : [];
                setBalance(profile?.walletBalance ?? 0);
                // Only orders purchased using wallet
                const walletOrders = orders.filter(
                    (o) => (o.payment?.method || '').toLowerCase() === 'wallet'
                );
                const items = walletOrders.map((o) => ({
                    _id: o._id,
                    type: 'debit',
                    title: 'Order Payment',
                    amount: o.pricing?.total ?? o.payableAmount ?? 0,
                    date: o.createdAt,
                    orderId: o.orderId,
                }));
                setTransactions(items);`;

const replacementBlock = `                const [profileRes, txRes] = await Promise.all([
                    customerApi.getProfile(),
                    customerApi.getWalletTransactions(),
                ]);
                const profile = profileRes.data?.result ?? profileRes.data?.data ?? profileRes.data;
                const items = txRes.data?.result?.items ?? txRes.data?.items ?? txRes.data?.data?.items ?? [];
                
                setBalance(profile?.walletBalance ?? 0);
                setTransactions(Array.isArray(items) ? items : []);`;

walletContent = walletContent.replace(targetBlock, replacementBlock);

fs.writeFileSync(walletFile, walletContent);
console.log('patched WalletPage.jsx');
