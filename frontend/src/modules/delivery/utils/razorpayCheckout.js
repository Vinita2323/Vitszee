const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

let loading = null;

/** Loads Razorpay Checkout once and resolves with the global Razorpay constructor. */
export function loadRazorpayCheckout() {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve(window.Razorpay);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Razorpay failed to load")));
    script.onerror = () => {
      loading = null;
      reject(new Error("Could not load Razorpay. Check your internet connection."));
    };
    document.body.appendChild(script);
  });
  return loading;
}
