import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SDPE DAG Frontend',
    short_name: 'SDPE DAG',
    description: 'SAR Data Processing Pipeline Operations Console',
    start_url: '/plan',
    scope: '/',
    display: 'standalone',
    background_color: '#091530',
    theme_color: '#0d1f45',
    categories: ['productivity', 'utilities'],
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Planning Console',
        short_name: 'Planning',
        url: '/plan',
      },
      {
        name: 'HDF5 Attributes',
        short_name: 'HDF5',
        url: '/plan/hdf5-attributes',
      },
      {
        name: 'Current Console',
        short_name: 'Current',
        url: '/current',
      },
    ],
  };
}
