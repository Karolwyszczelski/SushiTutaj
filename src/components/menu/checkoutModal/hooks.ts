"use client";


import React from "react";

function useIsMobile(breakpoint = 1024) {
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width:${breakpoint - 1}px)`);

    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, [breakpoint]);
  return isMobile;
}

export { useIsMobile };
