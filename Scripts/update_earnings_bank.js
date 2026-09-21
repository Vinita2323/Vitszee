const fs = require('fs');
const file = 'frontend/src/modules/delivery/pages/EarningsPage.jsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add state variables
content = content.replace(
  'const [isSubmitting, setIsSubmitting] = useState(false);',
  'const [isSubmitting, setIsSubmitting] = useState(false);\n  const [showBankDetails, setShowBankDetails] = useState(false);\n  const [bankDetails, setBankDetails] = useState(null);'
);

// 2. Fetch profile in useEffect
if (!content.includes('fetchProfile')) {
  content = content.replace(
    'const fetchEarnings = async () => {',
    const fetchProfile = async () => {
    try {
      const res = await deliveryApi.getProfile();
      if (res.data.success && res.data.result) {
        const { accountHolder, accountNumber, ifsc, name } = res.data.result;
        if (accountNumber) {
          setBankDetails({
            accountHolder: accountHolder || name || "N/A",
            accountNumber,
            ifsc: ifsc || "N/A"
          });
        }
      }
    } catch (error) {
      console.error("Failed to load bank details", error);
    }
  };

  const fetchEarnings = async () => {
  );
  
  content = content.replace(
    'fetchEarnings();',
    'fetchEarnings();\n    fetchProfile();'
  );
}

// 3. Render the block
const targetBlock = <div className="flex items-center gap-4">
                          <div className="h-10 w-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                              <Building2 className="h-5 w-5 text-brand-400" />
                          </div>
                          <div className="flex-1">
                              <p className="text-xs font-black text-slate-900 uppercase">Bank Transfer</p>
                              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-tighter">Registered Bank Account</p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-slate-300" />
                      </div>;

const newBlock = <div 
                          className="flex items-center gap-4 cursor-pointer"
                          onClick={() => setShowBankDetails(!showBankDetails)}
                      >
                          <div className="h-10 w-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                              <Building2 className="h-5 w-5 text-brand-400" />
                          </div>
                          <div className="flex-1">
                              <p className="text-xs font-black text-slate-900 uppercase">Bank Transfer</p>
                              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-tighter">Registered Bank Account</p>
                          </div>
                          <ArrowRight className={\h-4 w-4 text-slate-300 transition-transform \\} />
                      </div>
                      
                      {showBankDetails && (
                          <div className="mt-3 p-3 bg-white/60 rounded-xl border border-brand-100 space-y-2">
                              {bankDetails ? (
                                  <>
                                      <div className="flex justify-between">
                                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Account Holder</span>
                                          <span className="text-[10px] text-slate-900 font-black">{bankDetails.accountHolder}</span>
                                      </div>
                                      <div className="flex justify-between">
                                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Account Number</span>
                                          <span className="text-[10px] text-slate-900 font-black">{bankDetails.accountNumber}</span>
                                      </div>
                                      <div className="flex justify-between">
                                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">IFSC</span>
                                          <span className="text-[10px] text-slate-900 font-black">{bankDetails.ifsc}</span>
                                      </div>
                                  </>
                              ) : (
                                  <p className="text-[10px] text-amber-600 font-bold text-center">No bank details added yet. Please add them in your profile.</p>
                              )}
                          </div>
                      )};

content = content.replace(targetBlock, newBlock);

fs.writeFileSync(file, content);
