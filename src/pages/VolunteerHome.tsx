import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { SyncBadge } from '../App';
import AnimalsOut from '../components/AnimalsOut';
import { SiteStatus } from '../components/SiteStatus';
import { Icon, Page } from '../components/ui';
import { longDate, today } from '../lib/time';

export default function VolunteerHome() {
  const { me } = useAuth();
  return (
    <>
      <header className="top">
        <div className="top-row">
          <div className="brand">
            <img src="./heart.png" alt="" />
            <span><span className="p">PAWS</span><span className="a">app</span></span>
          </div>
          <SyncBadge />
        </div>
        <div className="top-row" style={{ alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h1 className="title">Hi {me.full_name.split(' ')[0]}</h1>
            <span className="sub">{longDate(today())}</span>
          </div>
          <span className="sync">Volunteer</span>
        </div>
      </header>
      <main className="main">
        <SiteStatus />
        <AnimalsOut />
        <Link to="/animal-out" className="btn full" style={{ minHeight: 56, fontSize: 16 }}>
          <Icon name="suitcase" size={20} color="#fff" width={2} /> Sign out an animal
        </Link>
        <div className="grid2">
          <Link to="/incidents" className="btn danger" style={{ minHeight: 52, padding: '0 8px' }}>
            <Icon name="alert" size={18} color="var(--red-strong)" width={2} /> Incident
          </Link>
          <Link to="/maintenance" className="btn ghost" style={{ minHeight: 52, padding: '0 8px', color: 'var(--amber)', borderColor: 'var(--amber-line)' }}>
            <Icon name="wrench" size={18} color="var(--amber)" width={2} /> Maintenance
          </Link>
        </div>
        <p className="note">Please sign in when you arrive and sign out when you leave, so the team knows who's on site.</p>
        <footer className="foot">
          <img src="./logo.png" alt="PAWS Rescue Qatar" />
          <span className="t13">Thank you for volunteering with PAWS</span>
        </footer>
      </main>
    </>
  );
}

export function VolunteerMore() {
  const { me, signOut } = useAuth();
  return (
    <Page title="More">
      <section className="card menu">
        <Link to="/notifications"><span className="lab">Notifications<small>Alerts on this phone</small></span><Icon name="chevron" size={18} color="var(--muted)" /></Link>
      </section>
      <section className="card menu">
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="t15">{me.full_name}</span>
          <span className="t13">{me.email} · Volunteer</span>
        </div>
        <button className="mi" style={{ color: 'var(--red)' }} onClick={signOut}>Sign out of PAWSapp</button>
      </section>
    </Page>
  );
}
