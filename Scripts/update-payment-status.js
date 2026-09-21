const fs = require('fs');
const file = 'frontend/src/modules/customer/pages/PaymentStatusPage.jsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add imports
const importsTarget = `import Button from "@shared/components/ui/Button";`;
const importsReplacement = `import Button from "@shared/components/ui/Button";
import { useCart } from "../context/CartContext";
import CheckoutOrderSuccess from "./checkout/components/CheckoutOrderSuccess";`;

if (content.includes(importsTarget)) {
    content = content.replace(importsTarget, importsReplacement);
}

// 2. Add useCart and targetOrderId
const hookTarget = `    const { showToast } = useToast();
    
    const merchantOrderId = searchParams.get("merchantOrderId");`;
const hookReplacement = `    const { showToast } = useToast();
    const { clearCart } = useCart();
    const [targetOrderId, setTargetOrderId] = useState(null);
    
    const merchantOrderId = searchParams.get("merchantOrderId");`;

if (content.includes(hookTarget)) {
    content = content.replace(hookTarget, hookReplacement);
}

// 3. Update verifyPayment success handling
const verifyTarget = `                if (paymentStatus === "CAPTURED") {
                    setStatus("success");
                    if (pollInterval.current) clearInterval(pollInterval.current);
                    
                    // Auto redirect after 3 seconds
                    setTimeout(() => {
                        const targetId = payment.checkoutGroupId || payment.publicOrderId || payment.order;
                        navigate(\`/orders/\${targetId}\`, { replace: true });
                    }, 4000);
                } else if`;
const verifyReplacement = `                if (paymentStatus === "CAPTURED") {
                    setStatus("success");
                    clearCart();
                    if (pollInterval.current) clearInterval(pollInterval.current);
                    
                    const targetId = payment.checkoutGroupId || payment.publicOrderId || payment.order;
                    setTargetOrderId(targetId);
                } else if`;

if (content.includes(verifyTarget)) {
    content = content.replace(verifyTarget, verifyReplacement);
}

// 4. Update render for success
const renderTarget = `    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50">
            <motion.div `;
const renderReplacement = `    if (status === "success" && targetOrderId) {
        return (
            <CheckoutOrderSuccess 
                orderId={targetOrderId} 
                onClose={() => navigate(\`/orders/\${targetOrderId}\`, { replace: true })} 
            />
        );
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50">
            <motion.div `;

if (content.includes(renderTarget)) {
    content = content.replace(renderTarget, renderReplacement);
}

fs.writeFileSync(file, content);
console.log("Updated PaymentStatusPage.jsx successfully.");
