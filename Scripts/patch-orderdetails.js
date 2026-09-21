const fs = require('fs');
const file = 'frontend/src/modules/delivery/pages/OrderDetails.jsx';
let content = fs.readFileSync(file, 'utf8');

const helperStr = `
const updateOrderState = (setOrder, newData) => {
  setOrder((prev) => {
    if (!prev) return newData;
    const next = { ...prev, ...newData };
    if (prev.seller && typeof newData.seller === "string") next.seller = prev.seller;
    if (prev.customer && typeof newData.customer === "string") next.customer = prev.customer;
    if (prev.address && typeof newData.address === "string") next.address = prev.address;
    return next;
  });
};
`;

// Insert the helper function after the getPersistedRiderStep function or before PUBLIC_STATUS_STEPS
if (!content.includes('updateOrderState')) {
    content = content.replace('const PUBLIC_STATUS_STEPS = [', helperStr + '\nconst PUBLIC_STATUS_STEPS = [');
}

// Replace occurrences
content = content.replace(/setOrder\(\(prev\) => \(\{\s*\.\.\.\(prev \|\| \{\}\),\s*\.\.\.updated\s*\}\)\);/g, 'updateOrderState(setOrder, updated);');
content = content.replace(/setOrder\(updated\);/g, 'updateOrderState(setOrder, updated);');
content = content.replace(/if\s*\(updatedOrder\)\s*setOrder\(updatedOrder\);/g, 'if (updatedOrder) updateOrderState(setOrder, updatedOrder);');

fs.writeFileSync(file, content);
console.log('OrderDetails.jsx patched.');
