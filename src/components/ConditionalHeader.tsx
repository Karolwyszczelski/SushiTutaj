"use client";

import { usePathname } from 'next/navigation';
import Header from './Header';

export default function ConditionalHeader() {
  const pathname = usePathname();

  // Jeśli ścieżka zaczyna się od '/admin', nie renderujemy headera
  if (pathname.startsWith('/admin')) {
    return null;
  }

  return <Header />;
}
