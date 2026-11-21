import PrivyRoot from "@/components/PrivyRoot";
import AppHeader from "@/components/AppHeader";

export default function FamilyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PrivyRoot>
        <AppHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24 pt-10">{children}</main>
      </PrivyRoot>
    </>
  );
}
