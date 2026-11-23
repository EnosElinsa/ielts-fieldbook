import type { VocabularyRecording } from './media';

export const hostedPronunciations: Partial<Record<string, { term: string; recording: VocabularyRecording }>> = {
  've-3cd002f2': {
    term: 'hierarchy',
    recording: {
      url: '/vocabulary-media/recordings/hierarchy-us.f908ad9f8e19bf06.mp3',
      aliases: [
        'https://upload.wikimedia.org/wikipedia/commons/7/79/En-us-hierarchy.ogg',
        'https://upload.wikimedia.org/wikipedia/commons/transcoded/7/79/En-us-hierarchy.ogg/En-us-hierarchy.ogg.mp3',
      ],
      title: 'File:En-us-hierarchy.ogg',
      accent: 'us',
      status: 'verified',
      availability: 'http-audio',
      wordformConfirmed: true,
      sourceUrl: 'https://commons.wikimedia.org/w/index.php?title=File:En-us-hierarchy.ogg&oldid=1229137074',
      author: 'DroEsperanto',
      license: 'Public domain (released by the author)',
      licenseUrl: 'https://commons.wikimedia.org/w/index.php?title=File:En-us-hierarchy.ogg&oldid=1229137074#Licensing',
      changes: 'Hosted copy of the Commons MP3 transcode.',
      reason: 'The author released this recording into the public domain and identified it as American English.',
    },
  },
  "ve-45258119": {
    "term": "materialism",
    "recording": {
      "url": "/vocabulary-media/recordings/materialism-us.062c46ed79cc7797.mp3",
      "aliases": [
        "https://upload.wikimedia.org/wikipedia/commons/7/78/En-us-materialism.ogg",
        "https://upload.wikimedia.org/wikipedia/commons/transcoded/7/78/En-us-materialism.ogg/En-us-materialism.ogg.mp3"
      ],
      "title": "File:En-us-materialism.ogg",
      "accent": "us",
      "status": "verified",
      "availability": "http-audio",
      "wordformConfirmed": true,
      "sourceUrl": "https://commons.wikimedia.org/w/index.php?title=File:En-us-materialism.ogg&oldid=1229143982",
      "author": "Steve Shives",
      "license": "CC0 1.0",
      "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
      "changes": "Hosted copy of the Commons MP3 transcode.",
      "reason": "The source description and U.S. English pronunciation category identify the word and accent."
    }
  }
};
