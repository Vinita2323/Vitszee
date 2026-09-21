const fs = require('fs');
const file = 'frontend/src/modules/customer/pages/CheckoutPage.jsx';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `      return false;
                <Lottie animationData={emptyBoxData} loop className="h-24 w-24 md:h-28 md:w-28" />`;

const replaceStr = `      return false;
    };

    // Single immediate check (covers WebSocket-unavailable case)
    customerApi
      .getOrderDetails(orderId)
      .then((r) => {
        if (r.data?.result) applyCancelled(r.data.result);
      })
      .catch(() => {});

    const off = onOrderStatusUpdate(getToken, (order) => applyCancelled(order));

    return () => {
      off();
      leaveOrderRoom(orderId, getToken);
    };
  }, [orderId, showSuccess]);

  // ─── Empty cart state ────────────────────────────────────────────────────────
  if (cart.length === 0 && !showSuccess && !isPlacingOrder) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
        {/* Back Button */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 md:top-8 md:left-8 z-50 w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-full shadow-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
        
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-[#F5FBF5]/50 via-transparent to-transparent pointer-events-none" />
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-[#1A4516]/5 rounded-full blur-3xl pointer-events-none animate-pulse" />
        <div className="absolute top-40 -left-20 w-60 h-60 bg-yellow-100/40 rounded-full blur-3xl pointer-events-none animate-pulse" />
        <div className="relative z-10 flex flex-col items-center text-center max-w-sm mx-auto">
          <div ref={emptyCartAnimRef} className="relative w-40 h-40 md:w-48 md:h-48 mb-6 flex items-center justify-center">
            <motion.div
              animate={emptyCartVisible ? { y: [-8, 8, -8] } : { y: 0 }}
              transition={emptyCartVisible ? { duration: 4, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
              className="relative z-10 rounded-3xl bg-white/90 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-slate-100">
              {emptyBoxData ? (
                <Lottie animationData={emptyBoxData} loop className="h-24 w-24 md:h-28 md:w-28" />`;

if (content.includes(targetStr)) {
  content = content.replace(targetStr, replaceStr);
  fs.writeFileSync(file, content);
  console.log("Success! File replaced.");
} else {
  console.log("Target string still not found!");
}
