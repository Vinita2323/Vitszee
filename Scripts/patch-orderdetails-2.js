const fs = require('fs');
const file = 'frontend/src/modules/delivery/pages/OrderDetails.jsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'setOrder({ ...updatedOrder, status: "delivered", workflowStatus: "DELIVERED" });',
  'updateOrderState(setOrder, { ...updatedOrder, status: "delivered", workflowStatus: "DELIVERED" });'
);

fs.writeFileSync(file, content);
console.log('OrderDetails.jsx line 537 patched.');
