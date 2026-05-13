/**
 * SDPE Design System — Tailwind v3 config for Lumir_SAR_Processor_GUI
 *
 * 기존 renderer/tailwind.config.js 를 이 파일로 교체합니다.
 * - darkMode: 'class' — <html class="dark"> 로 다크 모드 전환
 * - 기존 제한 팔레트(white/gray/blue/yellow/green/red) 유지
 * - SDPE 토큰(background, card, accent, destructive, ...) 추가
 * - 토큰은 rgb(var(--X) / <alpha-value>) 패턴으로 정의해 bg-accent/15 같은 알파 수식자 지원
 */

const colors = require('tailwindcss/colors');

/** 토큰 헬퍼 */
const token = (name) => `rgb(var(${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './renderer/pages/**/*.{js,ts,jsx,tsx}',
    './renderer/components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    colors: {
      // ── 기존 제한 팔레트 (Lumir 원본 유지) ──
      transparent: 'transparent',
      current: 'currentColor',
      white: colors.white,
      gray: colors.gray,
      blue: colors.blue,
      yellow: colors.yellow,
      green: colors.green,
      red: colors.red,

      // ── SDPE 디자인 토큰 ──
      background: token('--background'),
      foreground: token('--foreground'),
      card: {
        DEFAULT: token('--card'),
        foreground: token('--card-foreground'),
      },
      border: token('--border'),
      muted: {
        DEFAULT: token('--muted'),
        foreground: token('--muted-foreground'),
      },
      accent: {
        DEFAULT: token('--accent'),
        foreground: token('--accent-foreground'),
      },
      destructive: token('--destructive'),
      success: token('--success'),
      warning: token('--warning'),
      sidebar: {
        DEFAULT: token('--sidebar'),
        foreground: token('--sidebar-foreground'),
        border: token('--sidebar-border'),
        accent: token('--sidebar-accent'),
      },
      ring: token('--ring'),
    },
    extend: {},
  },
  plugins: [],
};
