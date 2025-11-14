"use client";
import { Tenant, TenantProvider } from "@/contexts/TenantContext";
export default function TenantClientProvider({tenant, children}:{tenant:Tenant; children:React.ReactNode}){
  return <TenantProvider value={tenant}>{children}</TenantProvider>;
}
