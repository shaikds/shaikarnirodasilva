"use client";

import { usePathname } from "next/navigation";
import { MobileNav } from "./MobileNav";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Bell, LogOut, User, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

function getBreadcrumb(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  return segments.map((s) => s.charAt(0).toUpperCase() + s.slice(1));
}

export function Header() {
  const pathname = usePathname();
  const breadcrumb = getBreadcrumb(pathname);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 md:px-6 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <MobileNav />
        <nav className="hidden sm:flex items-center gap-1.5 text-sm">
          {breadcrumb.map((item, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-slate-300 dark:text-slate-600">/</span>}
              <span
                className={
                  i === breadcrumb.length - 1
                    ? "font-medium text-slate-900 dark:text-slate-100"
                    : "text-slate-500 dark:text-slate-400"
                }
              >
                {item}
              </span>
            </span>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5 text-slate-500" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-600" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-blue-600 text-white text-xs">DU</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>
              <p className="font-medium">Demo User</p>
              <p className="text-xs text-slate-500">demo@trendsupply.com</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Link href="/dashboard/settings" className="flex items-center gap-2 w-full">
                <User className="h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Link href="/dashboard/settings" className="flex items-center gap-2 w-full">
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Link href="/login" className="flex items-center gap-2 w-full text-red-600">
                <LogOut className="h-4 w-4" />
                Log out
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
