import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") return res.status(200).json({ ok: true, id: req.query.id });
  if (req.method !== "POST") return res.status(405).end();

  const id = String(req.query.id);
  const minutes = Math.max(1, Number((req.body?.minutes ?? 30)));
  const etaISO = new Date(Date.now() + minutes * 60_000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("orders")
    .update({ status: "accepted", accepted_at: new Date().toISOString(), deliveryTime: etaISO })
    .eq("id", id)
    .select("id,status,deliveryTime")
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(200).json({ id: data.id, status: data.status, deliveryTime: data.deliveryTime ?? etaISO });
}
