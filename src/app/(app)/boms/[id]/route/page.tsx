import { redirect } from "next/navigation";
import { sectionHref } from "@/lib/bom/workflow";

/** The process route now lives on step 4, Line possible: this address opens it there. */
export default async function Moved({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(sectionHref((await params).id, "route", await searchParams));
}
