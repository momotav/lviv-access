import React, { useState, useEffect } from 'react';
import { CATEGORIES, CATEGORY_LIST, CategoryIcon } from '../lib/categories.jsx';
import { uploadImageToCloudinary } from '../lib/api.js';

const MAX_PHOTOS = 5;

export default function AddPointModal({ coords, onClose, onSubmit }) {
  const [category, setCategory] = useState('ramp');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rating, setRating] = useState(0);
  const [photoUrls, setPhotoUrls] = useState([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleFiles(fileList) {
    const files = Array.from(fileList).slice(0, MAX_PHOTOS - photoUrls.length);
    if (files.length === 0) return;

    setError(null);
    setUploadingCount(files.length);

    const results = await Promise.allSettled(
      files.map((f) => uploadImageToCloudinary(f))
    );

    const succeeded = results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => r.value);
    const failed = results.length - succeeded.length;

    setPhotoUrls((prev) => [...prev, ...succeeded]);
    setUploadingCount(0);
    if (failed > 0) {
      setError(`Не вдалося завантажити ${failed} фото`);
    }
  }

  function removePhoto(idx) {
    setPhotoUrls((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError('Назва обов\'язкова');
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
        photo_urls: photoUrls,
      });
    } catch (err) {
      setError(err.message || 'Не вдалося зберегти');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Закрити">✕</button>

        <header className="modal-header">
          <div className="modal-eyebrow">Новий об'єкт доступності</div>
          <h2 className="modal-title">Додати точку на карту</h2>
          <div className="modal-coords">
            {coords.lat.toFixed(5)}° N, {coords.lng.toFixed(5)}° E
          </div>
        </header>

        <div className="modal-body">
          {error && <div className="error-msg">{error}</div>}

          <div className="field">
            <label className="field-label">Категорія</label>
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
                  <span>{CATEGORIES[cat].shortLabel}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="point-name">Назва</label>
            <input
              id="point-name"
              className="field-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="напр., «Пандус біля Львівської опери»"
              maxLength={200}
              autoFocus
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="point-desc">Опис (необов'язково)</label>
            <textarea
              id="point-desc"
              className="field-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Корисні деталі — особливості доступності, години, умови…"
              maxLength={1000}
            />
          </div>

          <div className="field">
            <label className="field-label">Фотографії (необов'язково, до {MAX_PHOTOS})</label>
            <div className="photo-uploader">
              {photoUrls.map((url, i) => (
                <div key={url} className="photo-thumb">
                  <img src={url} alt={`фото ${i + 1}`} />
                  <button
                    type="button"
                    className="photo-thumb-remove"
                    onClick={() => removePhoto(i)}
                    aria-label="Видалити"
                  >✕</button>
                </div>
              ))}
              {uploadingCount > 0 && (
                <div className="photo-thumb photo-thumb-loading">
                  Завантажую {uploadingCount}…
                </div>
              )}
              {photoUrls.length + uploadingCount < MAX_PHOTOS && (
                <label className="photo-add">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handleFiles(e.target.files)}
                    style={{ display: 'none' }}
                  />
                  <span>+ Додати</span>
                </label>
              )}
            </div>
          </div>

          <div className="field">
            <label className="field-label">Початкова оцінка доступності (необов'язково)</label>
            <div className="rating-stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="rating-star"
                  data-filled={n <= rating}
                  onClick={() => setRating(rating === n ? 0 : n)}
                  aria-label={`Оцінка ${n}`}
                >★</button>
              ))}
            </div>
          </div>
        </div>

        <footer className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>Скасувати</button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting || uploadingCount > 0 || !name.trim()}
          >
            {submitting ? 'Зберігаю…' : 'Зберегти'}
          </button>
        </footer>
      </div>
    </div>
  );
}
