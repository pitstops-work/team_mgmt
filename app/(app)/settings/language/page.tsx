"use client";

import { useState, useEffect } from "react";
import { Languages } from "lucide-react";

const LANGS = [
  { code: "en", label: "English",   native: "English"   },
  { code: "ta", label: "Tamil",     native: "தமிழ்"    },
  { code: "kn", label: "Kannada",   native: "ಕನ್ನಡ"   },
  { code: "ml", label: "Malayalam", native: "മലയാളം"   },
  { code: "hi", label: "Hindi",     native: "हिन्दी"   },
  { code: "bn", label: "Bengali",   native: "বাংলা"    },
];

export default function LanguageSettingsPage() {
  const [preferredLang, setPreferredLang] = useState("en");
  const [langSaving, setLangSaving] = useState(false);
  const [langSuccess, setLangSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/account/language")
      .then(r => r.json())
      .then(d => { if (d.lang) setPreferredLang(d.lang); });
  }, []);

  const handleSaveLang = async (lang: string) => {
    setLangSaving(true);
    setLangSuccess(false);
    await fetch("/api/account/language", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang }),
    });
    setPreferredLang(lang);
    setLangSaving(false);
    setLangSuccess(true);
    setTimeout(() => setLangSuccess(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <h1 className="text-xl font-semibold text-stone-900 mb-8">Settings</h1>

      <section>
        <div className="flex items-center gap-2 mb-1">
          <Languages className="w-4 h-4 text-stone-400" />
          <h2 className="text-sm font-semibold text-stone-700">My Language</h2>
        </div>
        <p className="text-xs text-stone-500 mb-4">
          Thread messages will be shown in this language.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-sm">
          {LANGS.map((l) => (
            <button
              key={l.code}
              disabled={langSaving}
              onClick={() => handleSaveLang(l.code)}
              className={`flex flex-col items-start px-3 py-2.5 rounded-xl border text-left transition-colors disabled:opacity-50 ${
                preferredLang === l.code
                  ? "border-stone-800 bg-stone-900 text-white"
                  : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50 hover:border-stone-300"
              }`}
            >
              <span className="text-xs font-medium">{l.label}</span>
              <span className={`text-xs mt-0.5 ${preferredLang === l.code ? "text-stone-300" : "text-stone-400"}`}>
                {l.native}
              </span>
            </button>
          ))}
        </div>
        {langSuccess && <p className="text-xs text-emerald-600 mt-3">Language preference saved.</p>}
      </section>
    </div>
  );
}
