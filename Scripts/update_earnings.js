const fs = require('fs');
const path = require('path');
const file = 'frontend/src/modules/delivery/pages/Earnings.jsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('import Modal from "@/shared/components/ui/Modal"')) {
    content = content.replace(
        'import { toast } from "sonner";',
        'import { toast } from "sonner";\nimport Modal from "@/shared/components/ui/Modal";'
    );
    content = content.replace(
        'ArrowUpRight,\n  Download,\n} from "lucide-react";',
        'ArrowUpRight,\n  Download,\n  Info,\n  Building2,\n  ArrowRight\n} from "lucide-react";'
    );
}

if (!content.includes('const [isModalOpen, setIsModalOpen] = useState(false);')) {
    content = content.replace(
        'const [loading, setLoading] = useState(true);',
        'const [loading, setLoading] = useState(true);\n  const [isModalOpen, setIsModalOpen] = useState(false);\n  const [withdrawAmount, setWithdrawAmount] = useState("");\n  const [isSubmitting, setIsSubmitting] = useState(false);'
    );
    
    content = content.replace(
        'recentTransactions: []',
        'recentTransactions: [],\n    balances: { availableBalance: 0, pendingBalance: 0 }'
    );
    
    content = content.replace(
        'recentTransactions: result.transactions || result.recentTransactions || []',
        'recentTransactions: result.transactions || result.recentTransactions || [],\n          balances: result.balances || { availableBalance: 0, pendingBalance: 0 }'
    );
}

if (!content.includes('handleSubmitWithdrawal')) {
    const handleSubmitFunc = 
  const handleSubmitWithdrawal = async (e) => {
    e.preventDefault();
    const available = Number(earningsData.balances?.availableBalance || 0);

    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > available) {
        toast.error(\Please enter a valid amount within your available balance (?\).\);
        return;
    }

    try {
        setIsSubmitting(true);
        const response = await deliveryApi.requestWithdrawal({ amount: parseFloat(withdrawAmount) });
        if (response.data.success) {
            toast.success('Withdrawal request submitted successfully!');
            setIsModalOpen(false);
            setWithdrawAmount('');
            fetchEarnings();
        }
    } catch (error) {
        toast.error(error.response?.data?.message || "Failed to submit request");
    } finally {
        setIsSubmitting(false);
    }
  };
;
    content = content.replace('React.useEffect(() => {', handleSubmitFunc + '\n  React.useEffect(() => {');
}

if (!content.includes('Withdraw Funds')) {
    content = content.replace(
        '<Button variant="ghost" size="icon">\n            <Download size={20} className="text-gray-600" />\n          </Button>',
        '<div className="flex items-center gap-2">\n            <Button variant="outline" size="sm" onClick={() => setIsModalOpen(true)} className="text-sm font-bold bg-[#1A4516] text-white hover:bg-[#133A10] border-none rounded-xl">\n              Withdraw Funds\n            </Button>\n            <Button variant="ghost" size="icon">\n              <Download size={20} className="text-gray-600" />\n            </Button>\n          </div>'
    );
}

if (!content.includes('<Modal')) {
    const modalJSX = 
      {/* Request Modal */}
      <Modal
          isOpen={isModalOpen}
          onClose={() => !isSubmitting && setIsModalOpen(false)}
          title="Request Withdrawal"
      >
          <form onSubmit={handleSubmitWithdrawal} className="space-y-6 py-4">
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex items-center justify-between">
                  <div>
                      <p className="text-xs font-black text-slate-600 uppercase tracking-widest mb-1">Available to Withdraw</p>
                      <h4 className="text-2xl font-black text-brand-600">?{Number(earningsData.balances?.availableBalance || 0).toLocaleString()}</h4>
                  </div>
                  <div className="h-12 w-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                      <Info className="h-6 w-6 text-slate-300" />
                  </div>
              </div>

              <div className="space-y-4">
                  <div>
                      <label className="text-xs font-black text-slate-600 uppercase tracking-widest mb-2 block ml-1">Enter Amount</label>
                      <div className="relative group">
                          <span className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-300 group-focus-within:text-brand-500 transition-colors">?</span>
                          <input
                              type="number"
                              value={withdrawAmount}
                              onChange={(e) => setWithdrawAmount(e.target.value)}
                              placeholder="0.00"
                              className="w-full pl-12 pr-6 py-4 bg-white ring-1 ring-slate-200 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 rounded-2xl text-xl font-black outline-none transition-all placeholder:text-slate-200"
                          />
                      </div>
                  </div>

                  <div className="p-4 bg-brand-50/50 rounded-2xl border border-brand-100/50 space-y-3">
                      <p className="text-[10px] font-black text-brand-600 uppercase tracking-widest mb-1">Transfer Destination</p>
                      <div className="flex items-center gap-4">
                          <div className="h-10 w-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                              <Building2 className="h-5 w-5 text-brand-400" />
                          </div>
                          <div className="flex-1">
                              <p className="text-xs font-black text-slate-900 uppercase">Bank Transfer</p>
                              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-tighter">Registered Bank Account</p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-slate-300" />
                      </div>
                  </div>
              </div>

              <div className="flex flex-col gap-3 pt-4">
                  <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 hover:bg-slate-800 disabled:opacity-50 transition-all active:scale-95"
                  >
                      {isSubmitting ? <div className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : 'SUBMIT REQUEST'}
                  </button>
                  <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="w-full py-2 text-xs font-black text-slate-600 uppercase tracking-widest hover:text-slate-600 transition-colors"
                  >
                      Nevermind, keep funds
                  </button>
              </div>
          </form>
      </Modal>
;
    content = content.replace('</motion.div>\n    </div>', '</motion.div>\n' + modalJSX + '\n    </div>');
}

fs.writeFileSync(file, content);
console.log('Update complete');
