import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toggleTheme } from '../lib/theme.js';

export function ThemeToggle() {
  return (
    <button className="btn ghost small-btn" type="button" aria-label="Toggle light or dark theme" onClick={toggleTheme}>
      <svg className="icon-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>{' '}Theme
    </button>
  );
}

/** Top bar for the public pages. `link` is the one extra navigation button. */
export function SiteHeader({ link }) {
  return (
    <header className="topbar">
      <div className="container">
        <Link className="brand" to="/"><span className="logo">◎</span><span>PriceRadar</span></Link>
        <nav>
          <ThemeToggle />
          <Link className="btn ghost small-btn" to={link.to}>{link.label}</Link>
        </nav>
      </div>
    </header>
  );
}

export function Stars({ percent, rating }) {
  if (percent === null || percent === undefined) {
    return rating ? <span className="small muted">★ {rating}</span> : null;
  }
  const width = Math.max(0, Math.min(100, Number(percent)));
  return (
    <>
      <span className="stars" style={{ '--p': `${width}%` }} title={`Rated ${rating ?? ''}`} />
      {rating ? <> <span className="small muted">{rating}</span></> : null}
    </>
  );
}

/** Product image that swaps itself for a placeholder if it fails to load. */
export function SafeImage({ src, alt = '', mini = false, ...rest }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);

  if (failed) {
    return mini
      ? <div className="thumb-mini" style={{ visibility: 'hidden' }} />
      : <div className="img-fallback" aria-hidden="true">🛍️</div>;
  }
  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      className={mini ? 'thumb-mini' : undefined}
      onError={() => setFailed(true)}
      {...rest}
    />
  );
}

export function EmptyState({ icon, title, text, className = '', style, children }) {
  return (
    <div className={`empty ${className}`.trim()} style={style}>
      <div className="empty-icon">{icon}</div>
      <h1>{title}</h1>
      {text ? <p className="muted" style={{ marginTop: 6 }}>{text}</p> : null}
      {children}
    </div>
  );
}
