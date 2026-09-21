const fs = require('fs');
const file = 'backend/app/controller/deliveryController.js';
let content = fs.readFileSync(file, 'utf8');

const oldLogic =         // 1. Calculate current available balance
        const transactions = await Transaction.find({ user: deliveryBoyId, userModel: 'Delivery' });

        const settledBalance = transactions
            .filter(t => t.status === 'Settled')
            .reduce((acc, t) => acc + t.amount, 0);

        const pendingPayouts = transactions
            .filter(t => (t.status === 'Pending' || t.status === 'Processing') && t.type === 'Withdrawal')
            .reduce((acc, t) => acc + Math.abs(t.amount), 0);

        const availableBalance = settledBalance - pendingPayouts;

        if (amount > availableBalance) {
            return handleResponse(res, 400, \\\Insufficient balance. Available: ?\\\\);
        }

        // 2. Create Withdrawal Transaction
        const withdrawal = await Transaction.create({
            user: deliveryBoyId,
            userModel: "Delivery",
            type: "Withdrawal",
            amount: -Math.abs(amount),
            status: "Pending",
            reference: \\\WDR-DL-\\\\
        });

        return handleResponse(res, 201, "Withdrawal request submitted successfully", withdrawal);;

const newLogic =         // 1. Calculate current available balance from Wallet
        const wallet = await Wallet.findOne({ ownerId: deliveryBoyId, ownerType: "DELIVERY_PARTNER" });
        if (!wallet) {
            return handleResponse(res, 404, "Wallet not found");
        }

        const availableBalance = wallet.availableBalance;

        if (amount > availableBalance) {
            return handleResponse(res, 400, \\\Insufficient balance. Available: ?\\\\);
        }

        // 2. Create Withdrawal Transaction
        const withdrawal = await Transaction.create({
            user: deliveryBoyId,
            userModel: "Delivery",
            type: "Withdrawal",
            amount: -Math.abs(amount),
            status: "Pending",
            reference: \\\WDR-DL-\\\\
        });
        
        // 3. Update Wallet Balances
        wallet.availableBalance -= Math.abs(amount);
        wallet.pendingBalance += Math.abs(amount);
        await wallet.save();

        return handleResponse(res, 201, "Withdrawal request submitted successfully", withdrawal);;

// The oldLogic string might have backticks encoded as \\ because of PowerShell formatting.
// I'll just use Regex replacement to be safe.
