// Single source of truth for the app's supported UI/thread languages.
// Pure data (no imports) so it is safe to import from client components,
// server routes, and server libs alike.
export const SUPPORTED_LANGS = [
  { code: "en", label: "English",   native: "English"  },
  { code: "ta", label: "Tamil",     native: "தமிழ்"   },
  { code: "kn", label: "Kannada",   native: "ಕನ್ನಡ"  },
  { code: "ml", label: "Malayalam", native: "മലയാളം"  },
  { code: "hi", label: "Hindi",     native: "हिन्दी"  },
  { code: "bn", label: "Bengali",   native: "বাংলা"   },
] as const;

export type LangCode = (typeof SUPPORTED_LANGS)[number]["code"];
