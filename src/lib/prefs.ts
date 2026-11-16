import { cookies } from "next/headers";
import { isCurrency, type Currency } from "@/lib/currency";
import { CURRENCY_COOKIE_NAME } from "@/components/shell/constants";
import { ensureFx } from "@/server/fx";

/**
 * Display currency chosen in the top bar (cookie), defaulting to DEFAULT_CURRENCY / INR.
 * Every page that shows money calls this, so it is also where live FX rates are loaded.
 */
export async function getDisplayCurrency(): Promise<Currency> {
  await ensureFx();
  const value = (await cookies()).get(CURRENCY_COOKIE_NAME)?.value;
  if (isCurrency(value)) return value;
  const env = process.env.DEFAULT_CURRENCY;
  return isCurrency(env) ? env : "INR";
}
