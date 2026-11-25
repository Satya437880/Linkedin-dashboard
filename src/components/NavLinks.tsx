"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconDashboard, IconNote, IconPaste, IconSettings, IconTable, IconUpload, IconUsers } from "./Icons";

const NAV = [
  { href: "/dashboard", label: "Dashboard", Icon: IconDashboard },
  { href: "/prospects", label: "Prospects", Icon: IconUsers },
  { href: "/import-sheet", label: "Sync", Icon: IconTable },
  { href: "/paste-audit", label: "Insights", Icon: IconNote },
  { href: "/paste", label: "Profile", Icon: IconPaste },
  { href: "/import", label: "CSV import", Icon: IconUpload },
  { href: "/settings", label: "Settings", Icon: IconSettings },
];

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.map(({ href, label, Icon }) => {
        const on = path === href || path.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} aria-current={on ? "page" : undefined} onClick={onNavigate} className="nav-link">
            <Icon />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
