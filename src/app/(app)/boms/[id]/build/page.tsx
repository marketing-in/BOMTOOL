import { redirect } from "next/navigation";
import { sectionHref } from "@/lib/bom/workflow";

/** Build & quote (from its first part, the bare board) now lives on its step's page: this address opens it there. */
export default async function Moved({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(sectionHref((await params).id, "board", await searchParams));
}
