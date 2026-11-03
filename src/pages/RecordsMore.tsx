import { useAuth } from '../auth';
import { Page } from '../components/ui';

export default function RecordsMore() {
  const { me, signOut } = useAuth();
  return (
    <Page title="More">
      <section className="card">
        <span className="t15">{me.full_name}</span>
        <span className="t13">{me.email} · Animal records access</span>
        <span className="t14">You can see and update every animal's record. Changes are saved with your name in each animal's History.</span>
      </section>
      <section className="card menu">
        <button className="mi" style={{ color: 'var(--red)' }} onClick={signOut}>Sign out of PAWSapp</button>
      </section>
    </Page>
  );
}
