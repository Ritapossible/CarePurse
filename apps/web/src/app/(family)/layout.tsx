import PrivyRoot from "@/components/PrivyRoot";
import SiteHeader from "@/components/SiteHeader";

export default function FamilyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <PrivyRoot>
        <main className="mx-auto w-full max-w-xl flex-1 px-6 pb-24 pt-10">{children}</main>
      </PrivyRoot>
    </>
  );
}
