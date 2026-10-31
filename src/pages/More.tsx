import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Icon, Page } from '../components/ui';
import { useTable } from '../lib/hooks';

function Item({ to, icon, tint, color, label, sub, badge }: { to: string; icon: string; tint: string; color: string; label: string; sub?: string; badge?: number }) {
  return (
    <Link to={to}>
      <span className="ic" style={{ background: tint }}><Icon name={icon} size={20} color={color} /></span>
      <span className="lab">{label}{sub && <small>{sub}</small>}</span>
      {badge ? <span className="chip" style={{ background: 'var(--pink)', color: '#fff' }}>{badge}</span> : null}
      <Icon name="chevron" size={18} color="var(--muted)" width={2} />
    </Link>
  );
}

export default function More() {
  const { me, isMgmt, signOut } = useAuth();
  const profiles = useTable('profiles');
  const leave = useTable('leave_requests');
  const incidents = useTable('incidents');
  const pendingStaff = profiles.filter((p) => !p.active).length;
  const pendingLeave = leave.filter((l) => l.status === 'pending').length;
  const openIncidents = incidents.filter((i) => !i.acknowledged_at).length;
  const openMaint = useTable('maintenance_issues').filter((m) => m.status !== 'fixed').length;

  return (
    <Page title="More" right={<span className="sync">{isMgmt ? 'Management' : 'Staff'}</span>}>
      <section className="card menu">
        <Item to="/leave" icon="suitcase" tint="var(--blue-tint)" color="var(--blue-dark)" label="Leave" sub="Request leave, report sick, team calendar" badge={isMgmt ? pendingLeave : 0} />
      </section>

      <section className="card menu">
        <Item to="/incidents" icon="alert" tint="var(--red-tint)" color="var(--red)" label="Incidents" sub="Report or review" badge={isMgmt ? openIncidents : 0} />
        <Item to="/maintenance" icon="wrench" tint="var(--amber-tint)" color="var(--amber)" label="Maintenance" sub="Report broken things with a photo" badge={openMaint} />
        <Item to="/visitors" icon="qr" tint="var(--visitor-bg)" color="var(--visitor-fg)" label="Visitors" sub="Gate QR code and who's on site" />
        <Item to="/eod" icon="check" tint="var(--line-2)" color="var(--ink-2)" label="End-of-day check" sub="Today's report and past sign-offs" />
        <Item to="/notifications" icon="bell" tint="var(--line-2)" color="var(--ink-2)" label="Notifications" sub="Reminders on this phone" />
      </section>

      {isMgmt && (
        <section className="card menu">
          <span className="sect h">Management settings</span>
          <Item to="/staff" icon="people" tint="var(--line-2)" color="var(--ink-2)" label="Staff & permissions" sub="Approve new accounts, set roles" badge={pendingStaff} />
          <Item to="/kennels" icon="home2" tint="var(--line-2)" color="var(--ink-2)" label="Kennels & animals" sub="Kennel numbers, animals, meds, vaccines" />
          <Item to="/eod-settings" icon="settings" tint="var(--line-2)" color="var(--ink-2)" label="End-of-day checklist" sub="Edit the checks staff tick each evening" />
        </section>
      )}

      <section className="card menu">
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="t15">{me.full_name}</span>
          <span className="t13">{me.email}</span>
        </div>
        <button className="mi" style={{ color: 'var(--red)' }} onClick={signOut}>Sign out</button>
      </section>

      <footer className="foot">
        <img src="./logo.png" alt="PAWS Rescue Qatar" />
        <span className="t13">PAWSapp · v1</span>
      </footer>
    </Page>
  );
}
