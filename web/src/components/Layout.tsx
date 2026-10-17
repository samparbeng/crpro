import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useAuth } from "../auth";

type NavItem = { to: string; label: string; end?: boolean; admin?: boolean };

const NAV: { label: string; items: NavItem[] }[] = [
  { label: "Overview", items: [{ to: "/", label: "Dashboard", end: true }, { to: "/reports", label: "Reports" }] },
  {
    label: "Operations",
    items: [
      { to: "/reservations", label: "Reservations" },
      { to: "/invoices", label: "Pro-forma invoices" },
      { to: "/drivers", label: "Drivers" },
    ],
  },
  {
    label: "Fleet",
    items: [
      { to: "/vehicles", label: "Vehicles" },
      { to: "/service-records", label: "Service records" },
    ],
  },
  {
    label: "Procurement",
    items: [
      { to: "/purchase-orders", label: "Purchase orders" },
      { to: "/vendors", label: "Vendors" },
    ],
  },
  {
    label: "Settings",
    items: [
      { to: "/rates", label: "Rates" },
      { to: "/settings", label: "Categories & FX" },
      { to: "/users", label: "Users", admin: true },
    ],
  },
];

export function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setNavOpen(false), [location.pathname]);

  return (
    <div className={`shell${navOpen ? " nav-open" : ""}`}>
      <aside className="sidebar" onClick={(e) => e.target === e.currentTarget && setNavOpen(false)}>
        <div className="brand">
          <img src="/favicon.svg" alt="" />
          crpro
        </div>
        <nav className="nav">
          {NAV.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items
                .filter((i) => !i.admin || isAdmin)
                .map((i) => (
                  <NavLink key={i.to} to={i.to} end={i.end}>
                    {i.label}
                  </NavLink>
                ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn btn-sm menu-toggle" onClick={() => setNavOpen(true)} aria-label="Open menu">
            ☰ Menu
          </button>
          <NavLink to="/account" className="small user-link">
            {user?.fullName} {isAdmin && <span className="muted">(admin)</span>}
          </NavLink>
          <button className="btn btn-sm" onClick={logout}>Sign out</button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
