import { HashRouter, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Icon from './components/Icon';
import { ToastHost } from './components/ui';
import Home from './pages/Home';
import Matches from './pages/Matches';
import NewMatch from './pages/NewMatch';
import Analyze from './pages/Analyze';
import Record from './pages/Record';
import Live from './pages/Live';
import Clips from './pages/Clips';
import ClipEditor from './pages/ClipEditor';
import Presentations from './pages/Presentations';
import PresentationEditor from './pages/PresentationEditor';
import Present from './pages/Present';
import Squad from './pages/Squad';
import PlayerProfile from './pages/PlayerProfile';
import Settings from './pages/Settings';

const NAV = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/matches', label: 'Matches', icon: 'film' },
  { to: '/live', label: 'Live', icon: 'zap' },
  { to: '/clips', label: 'Clips', icon: 'scissors' },
  { to: '/presentations', label: 'Present', icon: 'present' },
  { to: '/squad', label: 'Squad', icon: 'users' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

function Brand() {
  return (
    <div className="brand">
      <img src="favicon.svg" alt="" width={34} height={34} />
      <div>
        <div className="brand-top">Hills Football</div>
        <div className="brand-name">Mastero</div>
      </div>
    </div>
  );
}

function Layout() {
  const loc = useLocation();
  useEffect(() => {
    document.querySelector('.main')?.scrollTo(0, 0);
  }, [loc.pathname]);
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-item">
              <Icon name={n.icon} />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <NavLink to="/record" className="btn primary record-cta">
          <Icon name="rec" size={14} /> Record match
        </NavLink>
      </aside>
      <main className="main">
        <Outlet />
      </main>
      <nav className="bottom-nav">
        {NAV.filter((n) => n.to !== '/settings').map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="bn-item">
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/presentations/:id/present" element={<Present />} />
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="matches" element={<Matches />} />
          <Route path="matches/new" element={<NewMatch />} />
          <Route path="matches/:id" element={<Analyze />} />
          <Route path="record" element={<Record />} />
          <Route path="live" element={<Live />} />
          <Route path="live/:id" element={<Live />} />
          <Route path="clips" element={<Clips />} />
          <Route path="clips/:id" element={<ClipEditor />} />
          <Route path="presentations" element={<Presentations />} />
          <Route path="presentations/:id" element={<PresentationEditor />} />
          <Route path="squad" element={<Squad />} />
          <Route path="squad/:id" element={<PlayerProfile />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
      <ToastHost />
    </HashRouter>
  );
}
