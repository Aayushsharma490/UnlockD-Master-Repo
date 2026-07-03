/**
 * BalanceCounter.tsx — Verdant Finance: Animated balance display
 *
 * Uses GSAP to tween from the previous balance to the new one whenever
 * the `balance` prop changes. This creates the satisfying "counting" effect
 * that makes balance updates feel responsive and premium — not just a flash.
 *
 * The animation runs on the raw paise integer and formats at the end of
 * each frame tick — never on intermediate float values — so the display
 * always shows valid currency amounts.
 */

import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { formatCurrencyCompact } from '../../utils/currency';

interface BalanceCounterProps {
  /** Balance in paise (integer) */
  balance: number;
  className?: string;
}

export const BalanceCounter: React.FC<BalanceCounterProps> = ({
  balance,
  className = '',
}) => {
  const [displayValue, setDisplayValue] = useState(balance);
  // Track the previous balance so GSAP knows where to tween FROM
  const prevBalanceRef = useRef<number>(balance);
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    // Don't animate on initial mount — just set the value
    if (prevBalanceRef.current === balance) return;

    // Kill any in-progress tween before starting a new one
    tweenRef.current?.kill();

    const obj = { value: prevBalanceRef.current };

    tweenRef.current = gsap.to(obj, {
      value: balance,
      duration: 0.9,
      ease: 'power3.out',
      onUpdate: () => {
        // Math.round keeps us in valid integer paise territory on every frame
        setDisplayValue(Math.round(obj.value));
      },
      onComplete: () => {
        // Ensure we land exactly on the target (avoids float residue)
        setDisplayValue(balance);
      },
    });

    prevBalanceRef.current = balance;

    return () => {
      tweenRef.current?.kill();
    };
  }, [balance]);

  return (
    <span className={`balance-figure ${className}`} aria-live="polite">
      {formatCurrencyCompact(displayValue)}
    </span>
  );
};

export default BalanceCounter;
