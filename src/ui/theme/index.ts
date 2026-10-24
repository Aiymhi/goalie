// Goalie's single source of visual truth. One original, calm, neutral palette
// with exactly ONE confident accent, plus type/spacing/radius scales and the
// accessibility floor. No screen should invent an ad-hoc colour or spacing —
// import from here so the whole app stays coherent. This identity is original
// to Goalie and imitates no other product.

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Apple's HIG minimum comfortable touch target. Every interactive element must
// be at least this tall/wide.
export const MIN_TOUCH_TARGET = 44;

// Calm neutral palette. Backgrounds are soft and warm-neutral; text is a near
// ink rather than pure black for a gentler read. The single accent is a
// grounded teal — confident without shouting, and distinct from the system
// blue every other RN app defaults to.
export const colors = {
  // Surfaces
  background: '#F7F6F3', // app canvas — warm paper neutral
  surface: '#FFFFFF', // cards / raised blocks
  surfaceMuted: '#EFEDE8', // subtle fills, chips, dividers' neighbours

  // Text
  ink: '#1F2421', // primary text (near-black, slightly warm)
  inkMuted: '#5B6460', // secondary text / labels
  inkFaint: '#8A928D', // hints, captions

  // The one accent + its on-colour and soft tint.
  accent: '#0E7C6B', // grounded teal
  accentPressed: '#0A6457',
  accentSoft: '#E1F0EC', // tinted background for accent contexts
  onAccent: '#FFFFFF',

  // Semantic states (used sparingly, never as a second brand colour).
  success: '#1E7D3C',
  successSoft: '#E6F4EA',
  danger: '#B3261E',
  dangerSoft: '#FBE9E7',
  warning: '#8A5A00',
  warningSoft: '#FFF4E0',

  border: '#DAD7D0',
  borderStrong: '#C3BFB6',
} as const;

// Spacing scale (4pt grid). Use these instead of magic numbers.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

// Corner radii.
export const radii = {
  sm: 8,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

// Type scale. Sizes pair with line heights that stay readable and are friendly
// to dynamic type (no values so tight that larger system text clips).
export const typography = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600' as const },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const },
  caption: { fontSize: 13, lineHeight: 19, fontWeight: '400' as const },
} as const;

export const theme = {
  colors,
  spacing,
  radii,
  typography,
  minTouchTarget: MIN_TOUCH_TARGET,
} as const;

// Honest reduce-motion signal. Wraps AccessibilityInfo.isReduceMotionEnabled()
// plus its change subscription. Defaults to motion-reduced-safe (true) if the
// query throws, so a restrained animation is the worst case, never a surprise
// one. Call sites short-circuit any celebration/animation when this is true.
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState<boolean>(true);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const enabled = await AccessibilityInfo.isReduceMotionEnabled();
        if (active) {
          setReduceMotion(enabled);
        }
      } catch {
        // Query failed — stay on the motion-reduced-safe default (true).
        if (active) {
          setReduceMotion(true);
        }
      }
    })();

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled: boolean) => {
        setReduceMotion(enabled);
      },
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
