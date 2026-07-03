/**
 * VerdantLogo.tsx — Inline SVG logo mark + wordmark
 *
 * The mark: a leaf-shaped vesica inside a rounded forest-green square badge,
 * crossed by a small terracotta upward arrow (represents growth).
 * This is an inline SVG so it scales perfectly and has no image request overhead.
 */

import React from 'react';

interface VerdantLogoProps {
  /** Show the wordmark next to the mark */
  showWordmark?: boolean;
  className?: string;
}

export const VerdantLogo: React.FC<VerdantLogoProps> = ({
  showWordmark = true,
  className = '',
}) => (
  <div className={`flex items-center gap-2.5 ${className}`}>
    {/* Logo mark — leaf vesica + terracotta arrow in green square badge */}
    <svg
      width="30"
      height="30"
      viewBox="0 0 30 30"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Forest-green rounded square badge */}
      <rect width="30" height="30" rx="8" fill="#2F4F3E" />

      {/* Vesica piscis (leaf/lens shape) — two arcs forming a pointed oval.
          This represents clarity and focus — two perspectives coming together. */}
      <path
        d="M15 5 C10.5 5 8 9 8 15 C8 21 10.5 25 15 25 C19.5 25 22 21 22 15 C22 9 19.5 5 15 5Z"
        fill="rgba(255, 255, 255, 0.12)"
        stroke="rgba(255, 255, 255, 0.35)"
        strokeWidth="0.75"
      />

      {/* Terracotta upward arrow — growth, positive momentum */}
      <path
        d="M15 21 L15 9"
        stroke="#B5533C"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M11.5 12.5 L15 9 L18.5 12.5"
        stroke="#B5533C"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>

    {/* Wordmark */}
    {showWordmark && (
      <span
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontSize: '18px',
          fontWeight: 400,
          letterSpacing: '-0.01em',
          color: 'var(--color-text)',
          lineHeight: 1,
        }}
      >
        Verdant
      </span>
    )}
  </div>
);

export default VerdantLogo;
