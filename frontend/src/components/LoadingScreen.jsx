import { LogoMark } from './Icons.jsx';

export default function LoadingScreen() {
  return (
    <main className="loading" role="status" aria-live="polite">
      <div className="loading__mark" aria-hidden="true">
        <LogoMark />
        <span className="loading__ring" aria-hidden="true" />
      </div>
      <h1>Preparing your workspace</h1>
      <p>Connecting to the support knowledge base…</p>
      <div className="loading__track" aria-hidden="true"><span /></div>
    </main>
  );
}
