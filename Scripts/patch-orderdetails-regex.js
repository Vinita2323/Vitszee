const fs = require('fs');
const file = 'frontend/src/modules/delivery/pages/OrderDetails.jsx';
let content = fs.readFileSync(file, 'utf8');

// Use a regex to match the inner div of the item mapping
const targetRegex = /<div className="flex items-center">\s*<span className="font-bold text-gray-500 mr-3 text-xs w-6 bg-white border border-gray-200 text-center rounded py-0\.5">\s*x\{item\.quantity\}\s*<\/span>\s*<span className="text-gray-800 font-medium">\{item\.name\}<\/span>\s*<\/div>/g;

const replacement = `<div className="flex items-center">
                        {(item.image || item.product?.mainImage) && (
                          <img src={item.image || item.product?.mainImage} alt={item.name} className="w-10 h-10 object-cover rounded mr-3 border border-gray-200" />
                        )}
                        <span className="font-bold text-gray-500 mr-3 text-xs w-6 bg-white border border-gray-200 text-center rounded py-0.5">
                          x{item.quantity}
                        </span>
                        <span className="text-gray-800 font-medium">{item.name}</span>
                      </div>`;

if (targetRegex.test(content)) {
  content = content.replace(targetRegex, replacement);
  fs.writeFileSync(file, content);
  console.log('OrderDetails.jsx item image patched successfully.');
} else {
  console.log('Regex did not match.');
}
