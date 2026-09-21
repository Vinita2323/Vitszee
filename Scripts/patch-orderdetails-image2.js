const fs = require('fs');
const file = 'frontend/src/modules/delivery/pages/OrderDetails.jsx';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `{item.image && (
                          <img src={item.image} alt={item.name} className="w-10 h-10 object-cover rounded mr-3 border border-gray-200" />
                        )}`;

const replacementStr = `{(item.image || item.product?.mainImage) && (
                          <img src={item.image || item.product?.mainImage} alt={item.name} className="w-10 h-10 object-cover rounded mr-3 border border-gray-200" />
                        )}`;

if (content.includes(targetStr)) {
  content = content.replace(targetStr, replacementStr);
  fs.writeFileSync(file, content);
  console.log('OrderDetails.jsx image access patched.');
} else {
  console.log('Target string not found in OrderDetails.jsx');
}
