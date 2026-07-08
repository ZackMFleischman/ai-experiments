import { STREAMS } from '../streams';
import { StreamTile } from './StreamTile';

export function Dashboard() {
  return (
    <main className="dashboard">
      <div className="grid">
        {STREAMS.map((s) => (
          <StreamTile key={s.id} stream={s} />
        ))}
      </div>
    </main>
  );
}
