"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-600 transition-colors"
      title="Sign out"
    >
      <LogOut className="w-3.5 h-3.5" />
      Sign out
    </button>
  );
}
