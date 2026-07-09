const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('resonara', {
  product: 'Resonara',
  tagline: 'Shape sound. Speak the long form. Play freely.',
  platform: process.platform,
  isDesktop: true,
});
