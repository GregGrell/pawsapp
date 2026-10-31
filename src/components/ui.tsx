import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { signedUrl } from '../lib/store';

const P: Record<string, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  tasks: <><path d="M9 6h11" /><path d="M9 12h11" /><path d="M9 18h11" /><path d="m3 6 1.5 1.5L7 5" /><path d="m3 12 1.5 1.5L7 11" /><path d="m3 18 1.5 1.5L7 17" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" /></>,
  cash: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5v5" /><path d="M18 9.5v5" /></>,
  more: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  check: <path d="M5 12.5 10 17l9-10" />,
  camera: <><path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.5" /></>,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
  bell: <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10.3 20a1.9 1.9 0 0 0 3.4 0" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  back: <path d="m15 6-6 6 6 6" />,
  heart: <><path d="M12 21s-7-4.4-9.3-9A5.2 5.2 0 0 1 12 6.5 5.2 5.2 0 0 1 21.3 12c-2.3 4.6-9.3 9-9.3 9z" /><path d="M12 10v5" /><path d="M9.5 12.5h5" /></>,
  suitcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M3 13h18" /></>,
  people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18 14a6 6 0 0 1 3.5 6" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3z" /><path d="M20 14v7h-3" /></>,
  wrench: <path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3-3 8-8-1.3-1.3a4 4 0 0 1-5-5l2.6 2.6 2.1-.5.5-2.1z M3 21l6-6" />,
  trash: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>,
  download: <><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></>,
  home2: <><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
};

export function Icon({ name, size = 20, color = 'currentColor', width = 1.9 }: { name: string; size?: number; color?: string; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  );
}

export function Stripe() {
  return (
    <div className="stripe" aria-hidden="true">
      <div /><div /><div />
    </div>
  );
}

export function Page({ title, sub, back, right, children }: { title: string; sub?: string; back?: string; right?: ReactNode; children: ReactNode }) {
  const nav = useNavigate();
  return (
    <>
      <header className="top">
        {back && (
          <button className="back" onClick={() => nav(-1)}>
            <Icon name="back" size={18} /> {back}
          </button>
        )}
        <div className="top-row" style={{ alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h1 className="title">{title}</h1>
            {sub && <span className="sub">{sub}</span>}
          </div>
          {right}
        </div>
      </header>
      <main className="main">{children}</main>
    </>
  );
}

export function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="pill" aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}

/** Pick a photo (camera on phones). Shrinks it before storing so uploads stay small on mobile data. */
export function PhotoPicker({ value, onChange, label = 'Add photo', accept = 'image/*', required }: { value: Blob | null; onChange: (b: Blob | null) => void; label?: string; accept?: string; required?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!value) return setPreview(null);
    const u = URL.createObjectURL(value);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);
  if (value)
    return (
      <div className="attached">
        {value.type.startsWith('image/') && preview && <img src={preview} alt="" />}
        <span className="t14" style={{ flex: 1, fontWeight: 600 }}>{value.type === 'application/pdf' ? 'PDF attached' : 'Photo attached'}</span>
        <button type="button" className="btn link sm" style={{ color: 'var(--red)' }} onClick={() => onChange(null)}>Remove</button>
      </div>
    );
  return (
    <>
      <button type="button" className="photo" onClick={() => ref.current?.click()}>
        <Icon name="camera" size={20} color="var(--blue)" /> {label}{required ? '' : ' · optional'}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        capture={accept === 'image/*' ? 'environment' : undefined}
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          onChange(f.type.startsWith('image/') ? await shrink(f) : f);
        }}
      />
    </>
  );
}

async function shrink(file: File, max = 1600): Promise<Blob> {
  try {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.8));
  } catch {
    return file;
  }
}

export function StoredImage({ bucket, path, alt = '' }: { bucket: string; path?: string | null; alt?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    signedUrl(bucket, path).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [bucket, path]);
  if (!path) return null;
  if (!url) return <span className="t13">Photo attached</span>;
  if (path.endsWith('.pdf'))
    return <a href={url} target="_blank" rel="noreferrer" className="ok">Open PDF</a>;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img className="thumb" src={url} alt={alt} />
    </a>
  );
}

let toastSet: ((s: string | null) => void) | null = null;
export function toast(msg: string) {
  toastSet?.(msg);
}
export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    toastSet = setMsg;
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
