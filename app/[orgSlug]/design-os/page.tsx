'use client';
export const dynamic = 'force-dynamic';

const DESIGN_OS_ORIGIN = 'https://os.empowerbuilding.ai';

export default function DesignOSPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <iframe
        src={DESIGN_OS_ORIGIN}
        style={{ flex: 1, border: 'none', width: '100%', display: 'block' }}
        allow="clipboard-read; clipboard-write; fullscreen"
        title="Design OS"
      />
    </div>
  );
}
