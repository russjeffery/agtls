"use client";

import Link from "next/link";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";

const TOOLS_LINKS = [
  { label: "Tasks", href: "/tasks" },
  { label: "Webhooks", href: "/webhooks" },
  { label: "Artifacts", href: "/artifacts" },
  { label: "Messages", href: "/messages" },
];

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

/**
 * The "Tools" dropdown grouping the resource pages. Self-contained so it can
 * sit in any header nav. Styled to match the sibling text nav links (mono,
 * uppercase, 12px). Uses the Base UI navigation menu for built-in keyboard
 * and screen-reader accessibility.
 */
export function ToolsMenu({ className }: { className?: string }) {
  return (
    <NavigationMenu className={className} style={{ color: "var(--text-body)" }}>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger
            className="h-auto rounded-none px-[18px] py-0 font-normal bg-transparent hover:bg-transparent data-popup-open:bg-transparent data-open:bg-transparent uppercase"
            style={{
              fontFamily: mono,
              fontSize: 12,
              letterSpacing: "0.12em",
            }}
          >
            Tools
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-40 gap-0.5">
              {TOOLS_LINKS.map((item) => (
                <li key={item.label}>
                  <NavigationMenuLink
                    render={<Link href={item.href} />}
                    className="text-sm"
                  >
                    {item.label}
                  </NavigationMenuLink>
                </li>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
