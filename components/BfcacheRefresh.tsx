'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function BfcacheRefresh() {
  const router = useRouter();
  useEffect(() => {
    const handle = (e: PageTransitionEvent) => {
      if (e.persisted) router.refresh();
    };
    window.addEventListener('pageshow', handle);
    return () => window.removeEventListener('pageshow', handle);
  }, [router]);
  return null;
}
