const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('resonara', {
  product: 'Resonara',
  tagline: 'Offline long-form text-to-speech',
  platform: process.platform,
  isDesktop: true,
});
