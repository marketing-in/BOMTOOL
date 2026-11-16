"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { threadContext } from "@/server/chat";

export type ChatState = { error?: string; sent?: number } | undefined;

const Input = z.object({ thread: z.string().min(3).max(120), body: z.string().trim().min(1, "Write a message first").max(4000), fromSeller: z.boolean() });

export async function postMessage(_: ChatState, form: FormData): Promise<ChatState> {
  const user = await requireUser("sourcing.buy");
  const parsed = Input.safeParse({ thread: form.get("thread"), body: form.get("body"), fromSeller: form.get("fromSeller") === "on" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the message" };
  const ctx = await threadContext(parsed.data.thread);
  if (!ctx) return { error: "That listing or RFQ no longer exists" };
  await db.message.create({
    data: { thread: ctx.thread, userId: user.id, author: parsed.data.fromSeller ? ctx.seller : (user.name ?? user.email ?? "Buyer"), fromSeller: parsed.data.fromSeller, body: parsed.data.body },
  });
  revalidatePath("/sourcing/chat");
  return { sent: Date.now() };
}
