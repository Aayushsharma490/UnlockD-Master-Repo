/**
 * SuccessConfirmation.tsx — Verdant Finance: Transfer result animation
 *
 * A tasteful, understated animated confirmation after a transfer completes.
 * On success: an SVG checkmark with a path-draw animation via Framer Motion.
 * On failure: a subtle X with terracotta color.
 *
 * Design principle: the animation should feel like a relieved exhale, not a
 * party popper. No confetti, no bouncing. Just a clean, confident signal.
 */

import React from 'react';
import { motion } from 'framer-motion';
import type { SubmitState } from '../../types';

interface SuccessConfirmationProps {
  state: SubmitState;
  message?: string;
  onDismiss?: () => void;
}

export const SuccessConfirmation: React.FC<SuccessConfirmationProps> = ({
  state,
  message,
  onDismiss,
}) => {
  if (state !== 'success' && state !== 'failed') return null;

  const isSuccess = state === 'success';
  const color = isSuccess ? 'var(--color-green)' : 'var(--color-terra)';
  const bgColor = isSuccess ? 'var(--color-green-light)' : 'var(--color-terra-light)';
  const borderColor = isSuccess
    ? 'rgba(47,79,62,0.15)'
    : 'rgba(181,83,60,0.15)';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center py-8 px-6 text-center"
    >
      {/* Animated SVG mark */}
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
        className="flex items-center justify-center rounded-full mb-6"
        style={{
          width: 64,
          height: 64,
          background: bgColor,
          border: `1px solid ${borderColor}`,
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 28 28"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {isSuccess ? (
            /* Checkmark path — draws in with pathLength animation */
            <motion.path
              d="M5 14.5L11 20.5L23 8"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, delay: 0.15, ease: 'easeOut' }}
            />
          ) : (
            /* X mark for failure */
            <>
              <motion.path
                d="M7 7L21 21"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.35, delay: 0.1, ease: 'easeOut' }}
              />
              <motion.path
                d="M21 7L7 21"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.35, delay: 0.2, ease: 'easeOut' }}
              />
            </>
          )}
        </svg>
      </motion.div>

      {/* Result text */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.25 }}
      >
        <p
          style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: '22px',
            fontWeight: 400,
            color: 'var(--color-text)',
            letterSpacing: '-0.01em',
            marginBottom: '8px',
          }}
        >
          {isSuccess ? 'Transfer complete.' : 'Transfer failed.'}
        </p>
        {message && (
          <p
            className="text-sm"
            style={{ color: 'var(--color-text-muted)', maxWidth: '280px' }}
          >
            {message}
          </p>
        )}
      </motion.div>

      {/* Dismiss / new transfer button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className={isSuccess ? 'btn-primary mt-6' : 'btn-secondary mt-6'}
        onClick={onDismiss}
        id="transfer-result-dismiss-btn"
      >
        {isSuccess ? 'Done' : 'Try again'}
      </motion.button>
    </motion.div>
  );
};

export default SuccessConfirmation;
