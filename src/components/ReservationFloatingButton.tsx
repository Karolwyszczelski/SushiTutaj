"use client";

import { useEffect, useState } from "react";
import ReservationModal from "./ReservationModal";

export default function ReservationFloatingButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const cb = () => setOpen(true);
    window.addEventListener("open-reservation", cb);
    return () => window.removeEventListener("open-reservation", cb);
  }, []);

  return <ReservationModal isOpen={open} onClose={() => setOpen(false)} />;
}
