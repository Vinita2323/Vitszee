import { useEffect, useState } from "react";
import useDebounce from "./useDebounce";

export function useProductSkuPreview(name, { enabled, loadPreview }) {
  const [preview, setPreview] = useState("");
  const debouncedName = useDebounce(name, 300);

  useEffect(() => {
    if (!enabled || !String(debouncedName || "").trim() || typeof loadPreview !== "function") {
      setPreview("");
      return undefined;
    }

    let cancelled = false;
    loadPreview(debouncedName)
      .then((sku) => {
        if (!cancelled) setPreview(sku || "");
      })
      .catch(() => {
        if (!cancelled) setPreview("");
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedName, enabled, loadPreview]);

  return preview;
}

export default useProductSkuPreview;
