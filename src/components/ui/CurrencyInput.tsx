import { useState, useEffect, useCallback } from "react";
import { formatIndianCurrency } from "@/data/assessment";

interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

export function CurrencyInput({
  value,
  onChange,
  placeholder = "0",
  className = "",
  id,
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState(
    value > 0 ? formatIndianCurrency(value).replace("₹", "") : "",
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/[^0-9]/g, "");
      if (raw === "") {
        setDisplayValue("");
        onChange(0);
        return;
      }
      const num = parseInt(raw, 10);
      if (!isNaN(num) && num >= 0) {
        setDisplayValue(formatIndianCurrency(num).replace("₹", ""));
        onChange(num);
      }
    },
    [onChange],
  );

  useEffect(() => {
    if (value === 0) {
      setDisplayValue("");
    } else {
      setDisplayValue(formatIndianCurrency(value).replace("₹", ""));
    }
  }, [value]);

  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-semibold text-muted-foreground">
        ₹
      </span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-white py-4 pl-12 pr-4 text-2xl font-semibold tracking-wide text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
        aria-label="Amount in Indian Rupees"
      />
    </div>
  );
}
