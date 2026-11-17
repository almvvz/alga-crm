import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import {
  DashboardIcon, LessonsIcon, MoneyIcon, SettingsIcon, SettlementIcon, StudentsIcon, TeamIcon, TutorsIcon,
} from "./icons.jsx";

const NAV = [
  { to: "/", label: "Dashboard", icon: DashboardIcon, end: true },
  { to: "/students", label: "Students", icon: StudentsIcon },
  { to: "/lessons", label: "Lessons", icon: LessonsIcon },
  { to: "/finance", label: "Finance", icon: MoneyIcon },
  { to: "/tutors", label: "Tutors", icon: TutorsIcon },
  { to: "/settlement", label: "Settlement", icon: SettlementIcon },
  { to: "/pricing", label: "Pricing", icon: SettingsIcon },
  { to: "/team", label: "Team", icon: TeamIcon },
];

export default function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 md:flex">
      <aside className="flex flex-col bg-slate-900 text-slate-300 md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0">
        <div className="flex items-center justify-between gap-2 px-5 py-4 md:py-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-lg font-bold text-white">A</span>
            <span className="text-lg font-semibold text-white">Alga</span>
          </div>
          <button onClick={logout} className="text-xs text-slate-400 hover:text-white md:hidden">Sign out</button>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:pb-0">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-indigo-500 text-white" : "hover:bg-slate-800 hover:text-white"}`}>
              <Icon />{label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden border-t border-slate-800 p-4 md:block">
          <p className="truncate text-sm font-medium text-white">{user.full_name}</p>
          <p className="truncate text-xs text-slate-400">{user.email}</p>
          <button onClick={logout} className="mt-2 text-xs text-slate-400 hover:text-white">Sign out</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8"><Outlet /></main>
    </div>
  );
}
