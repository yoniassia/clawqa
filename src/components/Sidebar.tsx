"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/dashboard/test-cycles", label: "Test Cycles", icon: "🔄" },
  { href: "/dashboard/bugs", label: "Bug Reports", icon: "🐛" },
  { href: "/dashboard/test-plans", label: "Test Plans", icon: "📝" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "📈" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

const agentOwnerItems = [
  { href: "/api-keys", label: "API Keys", icon: "🔑" },
];

const testerItems = [
  { href: "/dashboard/browse-tests", label: "Browse Tests", icon: "🔍" },
  { href: "/dashboard/my-tests", label: "My Tests", icon: "📋" },
  { href: "/dashboard/my-bugs", label: "My Bug Reports", icon: "🐛" },
];

export default function Sidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  let items = [...navItems];
  if (role === "tester") {
    items = [...navItems, ...testerItems];
  } else if (role === "agent-owner" || role === "admin") {
    items = [...navItems, ...agentOwnerItems];
  }

  return (
    <>
      <button onClick={() => setOpen(!open)} className="md:hidden fixed top-4 left-4 z-50 bg-gray-800 p-2 rounded-lg text-white">☰</button>
      <aside className={`fixed md:static inset-y-0 left-0 z-40 w-64 bg-gray-900/80 backdrop-blur-xl border-r border-gray-700/50 transform transition-transform ${open ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}>
        <div className="p-6">
          <Link href="/dashboard" className="text-2xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">ClawQA.ai</Link>
        </div>
        <nav className="px-4 space-y-1">
          {items.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${pathname === item.href ? "bg-green-500/20 text-green-400 border border-green-500/30" : "text-gray-400 hover:text-white hover:bg-gray-800/50"}`}>
              <span>{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-6 left-0 right-0 px-4">
          <Link href="/developers" className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800/50 transition-all">
            <span>🛠️</span><span>Developers</span>
          </Link>
          <Link href="/docs" className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800/50 transition-all">
            <span>📖</span><span>Documentation</span>
          </Link>
        </div>
      </aside>
      {open && <div className="md:hidden fixed inset-0 z-30 bg-black/50" onClick={() => setOpen(false)} />}
    </>
  );
}
