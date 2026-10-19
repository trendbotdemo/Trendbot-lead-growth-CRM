import { requireAgencyUser } from "@/lib/auth";
import { Logo } from "@/components/brand";
import { SideNav } from "@/components/nav";
import { logoutAction } from "../actions";

export default async function AgencyLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAgencyUser();
  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col md:flex-row">
      <aside className="border-b border-line px-4 py-4 md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-r md:border-b-0 md:py-5">
        <div className="mb-4 md:mb-6"><Logo href="/agency" /></div>
        <SideNav
          items={[
            { href: "/agency", label: "All clients", icon: "agency", exact: true },
            { href: "/agency/new", label: "Add client", icon: "leads" },
            { href: "/agency/team", label: "Team", icon: "settings" },
          ]}
        />
        <div className="mt-6 hidden border-t border-line pt-4 md:block">
          <div className="text-[13px] font-medium">{user.name}</div>
          <div className="truncate text-[12px] text-ink-3">{user.email}</div>
          <form action={logoutAction}><button className="mt-2 text-[12.5px] text-ink-2 hover:text-ink">Log out</button></form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
