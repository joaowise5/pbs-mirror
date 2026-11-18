import { Icon } from './Icons.jsx';

// Stand-in for resources that have no content source yet (Staff handbook, Escalation directory).
export default function PlaceholderView({ icon, title }) {
  return (
    <section className="view">
      <div className="page">
        <div className="empty">
          <Icon name={icon} />
          <p><strong>{title}</strong></p>
          <p>This resource isn’t connected yet. Ask your team lead for the current version.</p>
        </div>
      </div>
    </section>
  );
}
