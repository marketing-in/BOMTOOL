import { redirect } from "next/navigation";
import { sectionHref } from "@/lib/bom/workflow";

/** The quote now lives on its step's page: this address opens it there. */
export default async function Moved({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(sectionHref((await params).id, "quote", await searchParams));
}
