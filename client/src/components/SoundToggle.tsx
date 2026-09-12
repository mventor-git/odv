import { useState, type ReactNode } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { sound } from '@/lib/sound';

/** Quick sound mute toggle — sits next to the theme toggle (ticket 075). */
export function SoundToggle(): ReactNode {
  const [muted, setMuted] = useState(sound.isMuted());

  return (
    <button
      type="button"
      role="switch"
      aria-checked={!muted}
      aria-label="Toggle UI sounds"
      title={muted ? 'Enable UI sounds' : 'Mute UI sounds'}
      onClick={() => setMuted(sound.toggle())}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 ${
        muted
          ? 'border-border bg-muted shadow-inner'
          : 'border-success/40 bg-success/20 shadow-inner'
      }`}
    >
      <span
        className={`absolute top-0.5 flex h-5 w-5 items-center justify-center rounded-full shadow-md transition-all duration-200 ${
          muted
            ? 'start-0.5 bg-muted-foreground text-background'
            : 'end-0.5 bg-success text-white'
        }`}
      >
        {muted ? <VolumeX className="size-3" /> : <Volume2 className="size-3" />}
      </span>
    </button>
  );
}