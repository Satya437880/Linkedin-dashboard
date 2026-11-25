/** One icon family, all 20px with a 1.75 stroke so sizes and weights stay consistent. */
type P = { className?: string };
const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, focusable: false };

export const IconDashboard = ({ className }: P) => (<svg {...base} className={className}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>);
export const IconUsers = ({ className }: P) => (<svg {...base} className={className}><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" /><circle cx="10" cy="8" r="3.5" /><path d="M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.65a3.5 3.5 0 0 1 0 6.7" /></svg>);
export const IconPaste = ({ className }: P) => (<svg {...base} className={className}><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4.5h6M9 11h6M9 15h4" /></svg>);
export const IconUpload = ({ className }: P) => (<svg {...base} className={className}><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>);
export const IconSettings = ({ className }: P) => (<svg {...base} className={className}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>);
export const IconMenu = ({ className }: P) => (<svg {...base} className={className}><path d="M4 7h16M4 12h16M4 17h16" /></svg>);
export const IconClose = ({ className }: P) => (<svg {...base} className={className}><path d="M6 6l12 12M18 6 6 18" /></svg>);
export const IconBell = ({ className }: P) => (<svg {...base} className={className}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg>);
export const IconSearch = ({ className }: P) => (<svg {...base} className={className}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>);
export const IconCopy = ({ className }: P) => (<svg {...base} className={className}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></svg>);
export const IconLock = ({ className }: P) => (<svg {...base} className={className}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>);
export const IconExternal = ({ className }: P) => (<svg {...base} className={className}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>);
export const IconInbox = ({ className }: P) => (<svg {...base} className={className}><path d="M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><path d="M3 13h5l1 3h6l1-3h5" /></svg>);
export const IconAlert = ({ className }: P) => (<svg {...base} className={className}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" /></svg>);
export const IconCheck = ({ className }: P) => (<svg {...base} className={className}><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5" /></svg>);
export const IconSignOut = ({ className }: P) => (<svg {...base} className={className}><path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9" /></svg>);
export const IconTable = ({ className }: P) => (<svg {...base} className={className}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16" /></svg>);
export const IconNote = ({ className }: P) => (<svg {...base} className={className}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>);
