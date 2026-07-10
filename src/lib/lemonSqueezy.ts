import { supabase } from "./supabase";
import type { BillingCycle, Plan } from "./pricing";

export async function startLemonCheckout(plan: Exclude<Plan, "free">, cycle: BillingCycle) {
  const { data, error } = await supabase.functions.invoke("create-lemon-checkout", {
    body: { plan, cycle },
  });

  if (error) {
    throw new Error(error.message || "Unable to start checkout.");
  }

  if (!data?.url || typeof data.url !== "string") {
    throw new Error(data?.error || "Checkout URL was not returned.");
  }

  window.location.assign(data.url);
}
