import { useEffect, useState } from 'react';

interface UserAvatarProps {
  name: string;
  avatarUrl?: string | null;
  sizeClass?: string;
  textClass?: string;
  roundedClass?: string;
  className?: string;
}

export function getUserInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('') || 'U'
  );
}

export function UserAvatar({
  name,
  avatarUrl,
  sizeClass = 'h-8 w-8',
  textClass = 'text-xs',
  roundedClass = 'rounded-lg',
  className = '',
}: UserAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [avatarUrl]);

  const cleanUrl = typeof avatarUrl === 'string' ? avatarUrl.trim() : '';

  if (cleanUrl && !imgFailed) {
    return (
      <img
        src={cleanUrl}
        alt={`${name} profile avatar`}
        onError={() => setImgFailed(true)}
        className={`shrink-0 object-cover border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800 ${sizeClass} ${roundedClass} ${className}`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center bg-slate-900 font-display font-bold text-white dark:bg-indigo-600 ${sizeClass} ${textClass} ${roundedClass} ${className}`}
    >
      {getUserInitials(name)}
    </span>
  );
}
