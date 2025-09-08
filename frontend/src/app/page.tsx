// src/app/ClientPracticingSpace.tsx
'use client';

import dynamic from 'next/dynamic';

const PracticingSpace = dynamic(
  () => import('../components/PracticingSpace/PracticingSpace'),
  { ssr: false, loading: () => <div style={{ padding: 24 }}>Đang tải Practicing Space…</div> }
);

export default function ClientPracticingSpace() {
  return <PracticingSpace />;
}
