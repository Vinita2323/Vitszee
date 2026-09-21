const fs = require('fs');
const file = 'frontend/src/modules/delivery/pages/OrderHistory.jsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  '₹{Math.round((order.pricing?.total || 0) * 0.1)}',
  '₹{Math.round(order.paymentBreakdown?.riderPayoutTotal || ((order.pricing?.total || 0) * 0.1))}'
);

content = content.replace(
  '<MapPin size={10} className="mr-0.5 text-gray-400" />{" "}\n                              2.4 km',
  '<MapPin size={10} className="mr-0.5 text-gray-400" />{" "}\n                              {order.distanceSnapshot?.distanceKmRounded || 2.4} km'
);

// We should find the exact block for MapPin to be safe
const mapPinBlock = `                            <span className="flex items-center bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 font-medium">
                              <MapPin size={10} className="mr-0.5 text-gray-400" />{" "}
                              2.4 km
                            </span>`;
const newMapPinBlock = `                            <span className="flex items-center bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 font-medium">
                              <MapPin size={10} className="mr-0.5 text-gray-400" />{" "}
                              {order.distanceSnapshot?.distanceKmRounded || 2.4} km
                            </span>`;

content = content.replace(mapPinBlock, newMapPinBlock);

const clockBlock = `                            <span className="flex items-center bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 font-medium">
                              <Clock size={10} className="mr-0.5 text-gray-400" /> 15 min
                            </span>`;
const newClockBlock = `                            <span className="flex items-center bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 font-medium">
                              <Clock size={10} className="mr-0.5 text-gray-400" /> {Math.round((order.distanceSnapshot?.distanceKmRounded || 2.4) * 6.25)} min
                            </span>`;

content = content.replace(clockBlock, newClockBlock);

fs.writeFileSync(file, content);
console.log('patched OrderHistory.jsx');
