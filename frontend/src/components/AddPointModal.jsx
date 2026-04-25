import React, { useState, useEffect } from 'react';
import { CATEGORIES, CATEGORY_LIST, CategoryIcon } from '../lib/categories.jsx';

export default function AddPointModal({ coords, onClose, onSubmit }) {
  const [category, setCategory] = useState('ramp');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rating, setRating] = useState(0);
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
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        category,
        name: name.trim(),
        description: description.trim() || null,
        lat: coords.lat,
        lng: coords.lng,
        accessibility_rating: rating || null,
      });
    } catch (err) {
      setError(err.message || 'Failed to save');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <header className="modal-header">
          <div className="modal-eyebrow">New entry · Accessibility point</div>
          <h2 className="modal-title">Mark this location</h2>
          <div className="modal-coords">
            {coords.lat.toFixed(5)}°N, {coords.lng.toFixed(5)}°E
          </div>
        </header>

        <div className="modal-body">
          {error && <div className="error-msg">{error}</div>}

          <div className="field">
            <label className="field-label">Category</label>
            <div className="category-grid">
              {CATEGORY_LIST.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className="category-option"
                  data-active={category === cat}
                  onClick={() => setCategory(cat)}
                >
                  <CategoryIcon category={cat} size={22} />
                  <span>{CATEGORIES[cat].label.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="point-name">Name</label>
            <input
              id="point-name"
              className="field-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Ramp at Lviv Opera House"
              maxLength={200}
              autoFocus
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="point-desc">Description (optional)</label>
            <textarea
              id="point-desc"
              className="field-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Helpful details — accessibility specifics, hours, conditions…"
              maxLength={1000}
            />
          </div>

          <div className="field">
            <label className="field-label">Accessibility rating (optional)</label>
            <div className="rating-stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="rating-star"
                  data-filled={n <= rating}
                  onClick={() => setRating(rating === n ? 0 : n)}
                  aria-label={`Rate ${n} stars`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
        </div>

        <footer className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting || !name.trim()}
          >
            {submitting ? 'Saving…' : 'Save point'}
          </button>
        </footer>
      </div>
    </div>
  );
}
