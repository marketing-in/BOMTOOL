import Link from "next/link";
import { MessageSquare } from "lucide-react";

/** Opens the conversation with this listing's seller (or an RFQ's suppliers). */
export function ChatLink({ thread, label = "Chat with seller" }: { thread: string; label?: string }) {
  return (
    <Link
      href={`/sourcing/chat?thread=${encodeURIComponent(thread)}`}
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <MessageSquare className="size-4" aria-hidden />
    </Link>
  );
}
