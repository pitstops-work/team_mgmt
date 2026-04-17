"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

interface Option {
  value: string;
  label: string;
}

interface Props {
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  className?: string;
}

function CheckMark() {
  return (
    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
      <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function MultiSelect({ options, value, onChange, placeholder = "All", className }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const toggle = (v: string) => {
    if (value.includes(v)) {
      onChange(value.filter(x => x !== v));
    } else {
      onChange([...value, v]);
    }
  };

  const label =
    value.length === 0
      ? null
      : value.length === 1
      ? options.find(o => o.value === value[0])?.label ?? value[0]
      : `${value.length} selected`;

  const isActive = value.length > 0;

  return (
    <div ref={ref} className={`relative flex-shrink-0 ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`px-3 py-1.5 text-xs border rounded-lg bg-white flex items-center gap-1.5 transition-colors ${
          isActive
            ? "border-sky-400 text-sky-700"
            : "border-stone-200 text-stone-600 hover:border-stone-300"
        }`}
      >
        <span className={isActive ? "" : "text-stone-400"}>{label ?? placeholder}</span>
        <ChevronDown className="w-3 h-3 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-stone-200 rounded-xl shadow-lg min-w-[180px] py-1">
          <button
            type="button"
            onClick={() => { onChange([]); setOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors hover:bg-stone-50 ${
              value.length === 0 ? "text-sky-700 font-medium" : "text-stone-600"
            }`}
          >
            <span
              className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                value.length === 0 ? "bg-sky-500 border-sky-500" : "border-stone-300"
              }`}
            >
              {value.length === 0 && <CheckMark />}
            </span>
            All
          </button>

          <div className="h-px bg-stone-100 my-0.5" />

          {options.map(opt => {
            const checked = value.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors hover:bg-stone-50"
              >
                <span
                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                    checked ? "bg-sky-500 border-sky-500" : "border-stone-300"
                  }`}
                >
                  {checked && <CheckMark />}
                </span>
                <span className={checked ? "text-stone-800 font-medium" : "text-stone-600"}>{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
