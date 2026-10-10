import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { VocabularyIllustration } from './VocabularyIllustration';
import type { VocabularyIllustrationAsset } from '../../domain/vocabulary/media';
describe('detail illustration', () => {
 test('reserves dimensions, lazy loads, credits the file and hides a failed image', () => {
  const image = { src: '/image.webp', width: 640, height: 480, alt: 'Vegetables', caption: 'Food example.', author: 'Artist', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Image', license: 'CC BY', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', changes: 'Resized' } as VocabularyIllustrationAsset;
  render(<VocabularyIllustration image={image} />);
  const img = screen.getByAltText('Vegetables'); expect(img.getAttribute('loading')).toBe('lazy'); expect(img.getAttribute('width')).toBe('640'); expect(screen.getByText('CC BY').getAttribute('href')).toContain('creativecommons');
  fireEvent.error(img); expect(screen.queryByAltText('Vegetables')).toBeNull(); expect(screen.queryByText('Food example.')).toBeNull();
 });
});
