import { DirectoryTabs } from "@/components/directory/tabs";

export default function DirectoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DirectoryTabs />
      {children}
    </>
  );
}
