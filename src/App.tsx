import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { AuthGate } from './auth';
import { Icon, Stripe, Toaster } from './components/ui';
import { useStore } from './lib/hooks';
import Today from './pages/Today';
import Tasks from './pages/Tasks';
import Timesheet from './pages/Timesheet';
import Calendar from './pages/Calendar';
import PettyCash from './pages/PettyCash';
import More from './pages/More';
import Leave from './pages/Leave';
import ReportSick from './pages/ReportSick';
import Kennels from './pages/Kennels';
import Staff from './pages/Staff';
import EodCheck from './pages/EodCheck';
import EodSettings from './pages/EodSettings';
import Incidents from './pages/Incidents';
import Visitors from './pages/Visitors';
import VisitSignIn from './pages/VisitSignIn';
import Notifications from './pages/Notifications';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/visit" element={<VisitSignIn />} />
        <Route
          path="*"
          element={
            <AuthGate>
              <Shell />
            </AuthGate>
          }
        />
      </Routes>
    </HashRouter>
  );
}

function Shell() {
  const loc = useLocation();
  return (
    <div className="app">
      <Stripe />
      <Routes>
        <Route path="/" element={<Today />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/timesheet" element={<Timesheet />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/cash" element={<PettyCash />} />
        <Route path="/more" element={<More />} />
        <Route path="/leave" element={<Leave />} />
        <Route path="/sick" element={<ReportSick />} />
        <Route path="/kennels" element={<Kennels />} />
        <Route path="/staff" element={<Staff />} />
        <Route path="/eod" element={<EodCheck />} />
        <Route path="/eod-settings" element={<EodSettings />} />
        <Route path="/incidents" element={<Incidents />} />
        <Route path="/visitors" element={<Visitors />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="*" element={<Today />} />
      </Routes>
      <Nav path={loc.pathname} />
      <Toaster />
    </div>
  );
}

const TABS = [
  { to: '/', icon: 'home', label: 'Today' },
  { to: '/tasks', icon: 'tasks', label: 'Tasks' },
  { to: '/timesheet', icon: 'clock', label: 'Timesheet' },
  { to: '/calendar', icon: 'calendar', label: 'Calendar' },
  { to: '/cash', icon: 'cash', label: 'Petty cash' },
  { to: '/more', icon: 'more', label: 'More' },
];
const MORE_PATHS = ['/more', '/leave', '/sick', '/kennels', '/staff', '/eod-settings', '/incidents', '/visitors', '/notifications'];

function Nav({ path }: { path: string }) {
  return (
    <nav className="nav" aria-label="Main">
      {TABS.map((t) => {
        const active = t.to === '/more' ? MORE_PATHS.includes(path) : t.to === '/' ? path === '/' || path === '/eod' : path === t.to;
        return (
          <NavLink key={t.to} to={t.to} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
            <Icon name={t.icon} size={22} width={active ? 2.2 : 1.8} />
            {t.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

export function SyncBadge() {
  const s = useStore();
  const waiting = s.outbox.length;
  if (!s.online) return <span className="sync off">Offline{waiting ? ` · ${waiting} waiting` : ''}</span>;
  if (waiting) return <span className="sync off">{waiting} waiting to send</span>;
  if (s.error) return <span className="sync err" title={s.error}>Not synced</span>;
  if (s.syncing && !s.loaded) return <span className="sync">Loading…</span>;
  return <span className="sync">Up to date</span>;
}
