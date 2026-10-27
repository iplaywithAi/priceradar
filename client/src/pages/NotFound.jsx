import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui.jsx';
import { useTitle } from '../lib/hooks.js';

export default function NotFound() {
  useTitle('Page not found | PriceRadar');
  return (
    <div className="center-page">
      <EmptyState icon="🧭" title="Page not found" text="That page does not exist.">
        <Link className="btn" to="/">Back to PriceRadar</Link>
      </EmptyState>
    </div>
  );
}
