interface IconProps {
  readonly name:
    | 'add'
    | 'back'
    | 'check'
    | 'close'
    | 'copy'
    | 'delete'
    | 'download'
    | 'duplicate'
    | 'edit'
    | 'export'
    | 'fit'
    | 'fullscreen'
    | 'import'
    | 'library'
    | 'menu'
    | 'minus'
    | 'more'
    | 'normalize'
    | 'plus'
    | 'reset'
    | 'search'
    | 'share'
    | 'template'
    | 'warning';
  readonly size?: number;
}

const paths: Record<IconProps['name'], preact.JSX.Element> = {
  add: <path d="M12 5v14M5 12h14" />,
  back: <path d="m15 18-6-6 6-6" />,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
    </>
  ),
  delete: (
    <>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m0 0 5-5m-5 5-5-5" />
      <path d="M5 20h14" />
    </>
  ),
  duplicate: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  edit: (
    <>
      <path d="m4 20 4.5-1L19 8.5 15.5 5 5 15.5 4 20Z" />
      <path d="m13.5 7 3.5 3.5" />
    </>
  ),
  export: (
    <>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
    </>
  ),
  fit: (
    <>
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
      <path d="M8 3 3 8M16 3l5 5M8 21l-5-5M16 21l5-5" />
    </>
  ),
  fullscreen: (
    <>
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
    </>
  ),
  import: (
    <>
      <path d="M12 16V4m0 12-5-5m5 5 5-5" />
      <path d="M5 20h14" />
    </>
  ),
  library: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H10v18H6.5A2.5 2.5 0 0 1 4 18.5v-13Z" />
      <path d="M10 3h7.5A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5H10" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  minus: <path d="M5 12h14" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  normalize: (
    <>
      <path d="m4 20 10.5-10.5" />
      <path d="m13 5 1-2 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z" />
      <path d="m18 12 .75-1.5.75 1.5 1.5.75-1.5.75-.75 1.5-.75-1.5-1.5-.75 1.5-.75Z" />
      <path d="m5 10 .75-1.5L6.5 10l1.5.75-1.5.75L5.75 13 5 11.5l-1.5-.75L5 10Z" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  reset: (
    <>
      <path d="M4 4v6h6" />
      <path d="M5.5 15a7 7 0 1 0 .8-7.8L4 10" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.7 10.7 6.6-4.2M8.7 13.3l6.6 4.2" />
    </>
  ),
  template: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </>
  ),
  warning: (
    <>
      <path d="M10.3 3.7 2.5 18a2 2 0 0 0 1.8 3h15.4a2 2 0 0 0 1.8-3L13.7 3.7a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4m0 4h.01" />
    </>
  ),
};

export function Icon({ name, size = 18 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      class="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
