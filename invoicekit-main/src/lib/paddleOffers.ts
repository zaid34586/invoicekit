import { supabase } from "./supabase";

export type PaddleOfferSyncResult = {
  ok: boolean;
  discountId?: string;
  code?: string;
  status?: string;
  error?: string;
};

async function invoke(action: "sync" | "archive" | "test", offerId: string): Promise<PaddleOfferSyncResult> {
  const { data, error } = await supabase.functions.invoke("paddle-offers", {
    body: { action, offer_id: offerId },
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error || "Paddle offer operation failed.");
  return data as PaddleOfferSyncResult;
}

export function syncOfferWithPaddle(offerId: string) {
  return invoke("sync", offerId);
}

export function archiveOfferInPaddle(offerId: string) {
  return invoke("archive", offerId);
}

export function testOfferInPaddle(offerId: string) {
  return invoke("test", offerId);
}
