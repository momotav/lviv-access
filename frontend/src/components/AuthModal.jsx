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
      setError('Введіть email і пароль');
      return;
    }
    if (mode === 'register') {
      if (password.length < 8) {
        setError('Пароль має містити щонайменше 8 символів');
        return;
      }
      if (!displayName.trim() || displayName.trim().length < 2) {
        setError('Ім\'я має містити щонайменше 2 символи');
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
      setError(translateAuthError(err.message) || 'Помилка авторизації');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <button className="modal-close" onClick={onClose} aria-label="Закрити">✕</button>

        <header className="modal-header">
          <div className="modal-eyebrow">{mode === 'login' ? 'Ласкаво просимо' : 'Створити обліковий запис'}</div>
          <h2 className="modal-title">{mode === 'login' ? 'Вхід' : 'Реєстрація'}</h2>
        </header>

        <div className="modal-body">
          {error && <div className="error-msg">{error}</div>}

          {mode === 'register' && (
            <div className="field">
              <label className="field-label" htmlFor="auth-name">Ваше ім'я</label>
              <input
                id="auth-name"
                className="field-input"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Як вас будуть бачити інші"
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
            <label className="field-label" htmlFor="auth-password">Пароль</label>
            <input
              id="auth-password"
              className="field-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'Не менше 8 символів' : ''}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            />
          </div>

          <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>
            {mode === 'login' ? (
              <>Ще немає облікового запису? <a href="#" onClick={(e) => { e.preventDefault(); setMode('register'); setError(null); }} style={{ color: 'var(--primary)', fontWeight: 500 }}>Зареєструватись</a></>
            ) : (
              <>Вже маєте обліковий запис? <a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); setError(null); }} style={{ color: 'var(--primary)', fontWeight: 500 }}>Увійти</a></>
            )}
          </div>
        </div>

        <footer className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>Скасувати</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Зачекайте…' : (mode === 'login' ? 'Увійти' : 'Створити')}
          </button>
        </footer>
      </div>
    </div>
  );
}

function translateAuthError(msg) {
  if (!msg) return null;
  const map = {
    'Valid email required': 'Введіть коректний email',
    'Password must be at least 8 characters': 'Пароль має містити щонайменше 8 символів',
    'Display name must be 2-100 characters': 'Ім\'я має містити 2-100 символів',
    'A user with this email already exists': 'Користувач з цим email вже існує',
    'Invalid email or password': 'Невірний email або пароль',
    'Email and password required': 'Введіть email і пароль',
  };
  return map[msg] || msg;
}
