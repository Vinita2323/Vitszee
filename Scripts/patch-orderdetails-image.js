const fs = require('fs');
const file = 'frontend/src/modules/delivery/pages/OrderDetails.jsx';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `                  {(isReturn ? order.returnItems : order.items)?.map((item, i) => (
                    <div key={i} className="flex justify-between items-center text-sm">
                      <div className="flex items-center">
                        <span className="font-bold text-gray-500 mr-3 text-xs w-6 bg-white border border-gray-200 text-center rounded py-0.5">
                          x{item.quantity}
                        </span>
                        <span className="text-gray-800 font-medium">{item.name}</span>
                      </div>
                      <span className="font-bold text-gray-600">Rs.{item.price * item.quantity}</span>
                    </div>
                  ))}`;

const replacementStr = `                  {(isReturn ? order.returnItems : order.items)?.map((item, i) => (
                    <div key={i} className="flex justify-between items-center text-sm border-b border-gray-100 last:border-0 pb-2 last:pb-0">
                      <div className="flex items-center">
                        {item.image && (
                          <img src={item.image} alt={item.name} className="w-10 h-10 object-cover rounded mr-3 border border-gray-200" />
                        )}
                        <span className="font-bold text-gray-500 mr-3 text-xs w-6 bg-white border border-gray-200 text-center rounded py-0.5">
                          x{item.quantity}
                        </span>
                        <span className="text-gray-800 font-medium">{item.name}</span>
                      </div>
                      <span className="font-bold text-gray-600 shrink-0 ml-2">Rs.{item.price * item.quantity}</span>
                    </div>
                  ))}`;

if (content.includes(targetStr)) {
  content = content.replace(targetStr, replacementStr);
  fs.writeFileSync(file, content);
  console.log('OrderDetails.jsx items patched.');
} else {
  console.log('Target string not found in OrderDetails.jsx');
}
