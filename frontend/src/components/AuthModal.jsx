import React, { useState, useEffect } from 'react';
import { api, setToken } from '../lib/api.js';

export default function AuthModal({ initialMode = 'login', onClose, onAuthenticated }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSubmit() {
    setError(null);
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }
    if (mode === 'register') {
      if (password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }
      if (!displayName.trim() || displayName.trim().length < 2) {
        setError('Display name must be at least 2 characters');
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = mode === 'register'
        ? { email, password, display_name: displayName.trim() }
        : { email, password };
      const fn = mode === 'register' ? api.register : api.login;
      const result = await fn(payload);
      setToken(result.token);
      onAuthenticated(result.user);
    } catch (err) {
      setError(err.message || 'Authentication failed');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>

        <header className="modal-header">
          <div className="modal-eyebrow">{mode === 'login' ? 'Welcome back' : 'Join the atlas'}</div>
          <h2 className="modal-title">{mode === 'login' ? 'Sign in' : 'Create account'}</h2>
        </header>

        <div className="modal-body">
          {error && <div className="error-msg">{error}</div>}

          {mode === 'register' && (
            <div className="field">
              <label className="field-label" htmlFor="auth-name">Display name</label>
              <input
                id="auth-name"
                className="field-input"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How others will see you"
                maxLength={100}
              />
            </div>
          )}

          <div className="field">
            <label className="field-label" htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              className="field-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus={mode === 'login'}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              className="field-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'At least 8 characters' : ''}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            />
          </div>

          <div style={{ marginTop: 16, fontSize: 13, color: 'var(--ink-soft)', textAlign: 'center' }}>
            {mode === 'login' ? (
              <>No account yet? <a href="#" onClick={(e) => { e.preventDefault(); setMode('register'); setError(null); }} style={{ color: 'var(--accent)' }}>Sign up</a></>
            ) : (
              <>Already have an account? <a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); setError(null); }} style={{ color: 'var(--accent)' }}>Sign in</a></>
            )}
          </div>
        </div>

        <footer className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Please wait…' : (mode === 'login' ? 'Sign in' : 'Create account')}
          </button>
        </footer>
      </div>
    </div>
  );
}
