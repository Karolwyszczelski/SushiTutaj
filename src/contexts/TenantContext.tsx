"use client";
import { createContext, useContext } from "react";
export type Tenant = {
  id: string; slug: string; name: string; city: string;
  phone?: string|null; email?: string|null; address?: string|null;
};
export const TenantContext = createContext<Tenant|null>(null);
export function useTenant(){ return useContext(TenantContext); }
export function TenantProvider({value, children}:{value:Tenant; children:React.ReactNode}){
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}
