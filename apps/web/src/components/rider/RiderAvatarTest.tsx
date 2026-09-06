'use client';

/**
 * TEMPORARY test component — visual alignment check for layered rider avatars.
 * Not wired into random generation. Safe to delete once alignment is confirmed.
 */

import { getBeardAlignment, getHairAlignment, type AvatarLayerAlignment } from '@/data/avatarAlignment';

const AVATAR_SIZE = 256;

interface RiderAvatarTestProps {
  face: string;
  hair?: string | null;
  beard?: string | null;
}

function overlayTransform({ x, y, scale }: AvatarLayerAlignment): string {
  return `translate(${x}%, ${y}%) scale(${scale})`;
}

function RiderAvatarTest({ face, hair = null, beard = null }: RiderAvatarTestProps) {
  return (
    <div
      style={{
        position: 'relative',
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        overflow: 'hidden',
        background: '#e5e5e5',
      }}
    >
      {/* Layer 1: face (base) */}
      <img
        src={face}
        alt="face"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
      />

      {/* Layer 2: hair (optional, transparent overlay) */}
      {hair && (
        <img
          src={hair}
          alt="hair"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            transform: overlayTransform(getHairAlignment(hair)),
          }}
        />
      )}

      {/* Layer 3: beard (optional, transparent overlay) */}
      {beard && (
        <img
          src={beard}
          alt="beard"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            transform: overlayTransform(getBeardAlignment(beard)),
          }}
        />
      )}
    </div>
  );
}

export default function RiderAvatarTestPage() {
  return (
    <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600 }}>RiderAvatar alignment test (temporary)</h1>

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <p style={{ marginBottom: 8, fontSize: 14 }}>face + hair + beard</p>
          <RiderAvatarTest
            face="/avatars/male/1.png"
            hair="/avatars/male-hair/1a.png"
            beard="/avatars/male-beard/1b.png"
          />
        </div>

        <div>
          <p style={{ marginBottom: 8, fontSize: 14 }}>face only (bald, clean shaven)</p>
          <RiderAvatarTest face="/avatars/male/1.png" hair={null} beard={null} />
        </div>

        <div>
          <p style={{ marginBottom: 8, fontSize: 14 }}>face + hair, no beard</p>
          <RiderAvatarTest face="/avatars/male/1.png" hair="/avatars/male-hair/1a.png" beard={null} />
        </div>

        <div>
          <p style={{ marginBottom: 8, fontSize: 14 }}>face + beard, no hair</p>
          <RiderAvatarTest face="/avatars/male/1.png" hair={null} beard="/avatars/male-beard/1b.png" />
        </div>
      </div>
    </div>
  );
}
