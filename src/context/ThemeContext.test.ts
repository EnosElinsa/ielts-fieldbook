import { afterEach, expect, test } from 'vitest';
import { applyTheme } from './ThemeContext';

afterEach(() => { document.head.innerHTML = ''; });

test('an explicit app theme sets every theme-color meta, whatever the OS preference', () => {
  document.head.innerHTML = '<meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#18191c" media="(prefers-color-scheme: dark)">';
  const colors = () => [...document.querySelectorAll('meta[name="theme-color"]')].map(meta => meta.getAttribute('content'));
  applyTheme('dark');
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(colors()).toEqual(['#18191c', '#18191c']);
  applyTheme('light');
  expect(colors()).toEqual(['#f6f7f9', '#f6f7f9']);
});
