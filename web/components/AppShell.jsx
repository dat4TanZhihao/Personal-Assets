'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const nav = [
  ['总览', '/dashboard', '⌂'],
  ['持仓', '/holdings', '◇'],
  ['现金', '/cashflows', '¥'],
  ['定投', '/plans', '↻'],
  ['同步', '/sync', '⇄'],
  ['设置', '/settings', '⚙']
];

export default function AppShell({ children }) {
  const pathname = usePathname();
  return (
    <>
      <main className="app-shell">{children}</main>
      <nav className="bottom-nav" aria-label="底部导航">
        {nav.map(([label, href, icon]) => (
          <Link key={href} className={`nav-link ${pathname === href || (href === '/dashboard' && pathname === '/') ? 'nav-link-active' : ''}`} href={href}>
            <span aria-hidden="true">{icon}</span>
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
