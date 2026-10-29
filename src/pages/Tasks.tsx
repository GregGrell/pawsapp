import { useState } from 'react';
import { Link } from 'react-router-dom';
import TaskList from '../components/TaskList';
import { Page } from '../components/ui';
import { addDays, shortDate, today } from '../lib/time';

export default function Tasks() {
  const [day, setDay] = useState(today());
  const d = today();
  const days = [addDays(d, -1), d, addDays(d, 1), addDays(d, 2)];
  return (
    <Page title="Tasks" sub={day === d ? 'Today' : shortDate(day)} right={<Link to="/calendar?add=task" className="btn sm">+ Add task</Link>}>
      <div className="pills">
        {days.map((x) => (
          <button key={x} className="pill" aria-pressed={x === day} onClick={() => setDay(x)}>
            {x === d ? 'Today' : x === addDays(d, -1) ? 'Yesterday' : x === addDays(d, 1) ? 'Tomorrow' : shortDate(x)}
          </button>
        ))}
      </div>
      <section className="card tight">
        <TaskList day={day} />
      </section>
      <p className="note">Repeating tasks appear here automatically each day or week. Claim one with "I've got it", then mark it done with an optional photo.</p>
    </Page>
  );
}
