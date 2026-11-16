"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2, Send } from "lucide-react";
import { postMessage, type ChatState } from "@/app/(app)/sourcing/chat/actions";
import { Button } from "@/components/ui/button";

export function ChatForm({ thread, seller }: { thread: string; seller: string }) {
  const [state, action, pending] = useActionState<ChatState, FormData>(postMessage, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.sent) form.current?.reset();
  }, [state?.sent]);
  return (
    <form ref={form} action={action} className="space-y-2 border-t p-4">
      <input type="hidden" name="thread" value={thread} />
      <label htmlFor="chat-body" className="sr-only">Message</label>
      <textarea id="chat-body" name="body" rows={3} required placeholder="Ask about date code, CoC, a counter-offer…" className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" name="fromSeller" className="size-4 accent-[var(--primary)]" /> Record {seller}&apos;s reply (phone, e-mail)
        </label>
        <Button type="submit" className="h-10" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />} Send
        </Button>
      </div>
      {state?.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
    </form>
  );
}
