import { supabase } from "./supabase";

export type PaddlePriceSyncResult = {
  ok: boolean;
  productId?: string;
  monthlyPriceId?: string;
  yearlyPriceId?: string;
  error?: string;
};

export type PaddlePriceTestResult = {
  ok: boolean;
  monthly: { id?: string; amount?: string; currency?: string; status?: string } | null;
  yearly: { id?: string; amount?: string; currency?: string; status?: string } | null;
  error?: string;
};

async function invoke<T>(action: "sync" | "test", planId: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke("paddle-prices", {
    body: { action, plan_id: planId },
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error || "Paddle price operation failed.");
  return data as T;
}

export function syncPlanWithPaddle(planId: string) {
  return invoke<PaddlePriceSyncResult>("sync", planId);
}

export function testPlanInPaddle(planId: string) {
  return invoke<PaddlePriceTestResult>("test", planId);
}
