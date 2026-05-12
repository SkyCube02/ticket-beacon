// ── Theme definitions ─────────────────────────────────────────────────────────

export const THEMES = {
  neon: {
    name: 'Neon',
    description: 'Electric blue on deep black',
    bg:          '#04080f',
    surface:     '#080d18',
    card:        '#0d1525',
    border:      '#1a2540',
    borderHover: '#2a3f6f',
    text:        '#f0f4ff',
    muted:       '#6878a0',
    dim:         '#374060',
    accent:      '#2563eb',
    accentDim:   '#1e3a7a',
    accentLight: '#93c5fd',
    white:       '#ffffff',
    green:       '#22c55e',
    red:         '#ef4444',
    yellow:      '#eab308',
    orange:      '#f97316',
    cyan:        '#06b6d4',
  },
  slate: {
    name: 'Slate',
    description: 'Sleek modern dark',
    bg:          '#0f0f11',
    surface:     '#18181b',
    card:        '#1f1f23',
    border:      '#27272a',
    borderHover: '#3f3f46',
    text:        '#fafafa',
    muted:       '#71717a',
    dim:         '#3f3f46',
    accent:      '#3b82f6',
    accentDim:   '#172554',
    accentLight: '#93c5fd',
    white:       '#ffffff',
    green:       '#22c55e',
    red:         '#ef4444',
    yellow:      '#eab308',
    orange:      '#f97316',
    cyan:        '#06b6d4',
  },
  midnight: {
    name: 'Midnight',
    description: 'Ultra minimal near-black',
    bg:          '#030305',
    surface:     '#08080f',
    card:        '#0f0f1a',
    border:      '#1a1a2e',
    borderHover: '#2a2a4a',
    text:        '#e8e8ff',
    muted:       '#5a5a8a',
    dim:         '#2a2a42',
    accent:      '#6366f1',
    accentDim:   '#1e1b4b',
    accentLight: '#a5b4fc',
    white:       '#ffffff',
    green:       '#34d399',
    red:         '#f87171',
    yellow:      '#fbbf24',
    orange:      '#fb923c',
    cyan:        '#22d3ee',
  },
  light: {
    name: 'Light',
    description: 'Clean professional light mode',
    bg:          '#f8fafc',
    surface:     '#ffffff',
    card:        '#f1f5f9',
    border:      '#e2e8f0',
    borderHover: '#cbd5e1',
    text:        '#0f172a',
    muted:       '#64748b',
    dim:         '#94a3b8',
    accent:      '#2563eb',
    accentDim:   '#dbeafe',
    accentLight: '#1d4ed8',
    white:       '#ffffff',
    green:       '#16a34a',
    red:         '#dc2626',
    yellow:      '#ca8a04',
    orange:      '#ea580c',
    cyan:        '#0891b2',
  },
};

// Priority badge colours per theme
const PRIORITY_THEMES = {
  neon: {
    P1:{bg:"#2d0a0a",text:"#f87171",border:"#7f1d1d"},
    P2:{bg:"#2d1a06",text:"#fb923c",border:"#7c2d12"},
    P3:{bg:"#1f1d06",text:"#facc15",border:"#713f12"},
    P4:{bg:"#061a0e",text:"#4ade80",border:"#14532d"},
    P5:{bg:"#06101f",text:"#60a5fa",border:"#1e3a5f"},
  },
  slate: {
    P1:{bg:"#1f0a0a",text:"#f87171",border:"#7f1d1d"},
    P2:{bg:"#1f1208",text:"#fb923c",border:"#7c2d12"},
    P3:{bg:"#1a1908",text:"#fbbf24",border:"#713f12"},
    P4:{bg:"#08160e",text:"#4ade80",border:"#14532d"},
    P5:{bg:"#0a1020",text:"#60a5fa",border:"#1e3a5f"},
  },
  midnight: {
    P1:{bg:"#1a0505",text:"#fca5a5",border:"#7f1d1d"},
    P2:{bg:"#1a0e04",text:"#fdba74",border:"#9a3412"},
    P3:{bg:"#14120a",text:"#fcd34d",border:"#92400e"},
    P4:{bg:"#061008",text:"#6ee7b7",border:"#065f46"},
    P5:{bg:"#080818",text:"#a5b4fc",border:"#312e81"},
  },
  light: {
    P1:{bg:"#fef2f2",text:"#dc2626",border:"#fecaca"},
    P2:{bg:"#fff7ed",text:"#ea580c",border:"#fed7aa"},
    P3:{bg:"#fefce8",text:"#ca8a04",border:"#fef08a"},
    P4:{bg:"#f0fdf4",text:"#16a34a",border:"#bbf7d0"},
    P5:{bg:"#eff6ff",text:"#2563eb",border:"#bfdbfe"},
  },
};

// Status badge colours per theme
const STATUS_THEMES = {
  neon: {
    OPEN:{bg:"#0d1a3a",text:"#93c5fd"},
    ACKNOWLEDGED:{bg:"#052010",text:"#4ade80"},
    "IN PROGRESS":{bg:"#061829",text:"#38bdf8"},
    "PENDING CLIENT":{bg:"#1a0a2e",text:"#c084fc"},
    RESOLVED:{bg:"#052010",text:"#4ade80"},
    CLOSED:{bg:"#0d0d0d",text:"#4b5563"},
    ESCALATED:{bg:"#2d1a06",text:"#fb923c"},
    "SLA BREACHED":{bg:"#2d0a0a",text:"#f87171"},
    CANCELLED:{bg:"#111111",text:"#6b7280"},
  },
  slate: {
    OPEN:{bg:"#172554",text:"#93c5fd"},
    ACKNOWLEDGED:{bg:"#052e16",text:"#4ade80"},
    "IN PROGRESS":{bg:"#0c1a2e",text:"#38bdf8"},
    "PENDING CLIENT":{bg:"#1e1b4b",text:"#c084fc"},
    RESOLVED:{bg:"#052e16",text:"#4ade80"},
    CLOSED:{bg:"#18181b",text:"#52525b"},
    ESCALATED:{bg:"#431407",text:"#fb923c"},
    "SLA BREACHED":{bg:"#450a0a",text:"#f87171"},
    CANCELLED:{bg:"#18181b",text:"#71717a"},
  },
  midnight: {
    OPEN:{bg:"#0e1530",text:"#a5b4fc"},
    ACKNOWLEDGED:{bg:"#052e16",text:"#6ee7b7"},
    "IN PROGRESS":{bg:"#082030",text:"#67e8f9"},
    "PENDING CLIENT":{bg:"#1e1b4b",text:"#c4b5fd"},
    RESOLVED:{bg:"#052e16",text:"#6ee7b7"},
    CLOSED:{bg:"#0f0f1a",text:"#4b4b6a"},
    ESCALATED:{bg:"#1a0e04",text:"#fdba74"},
    "SLA BREACHED":{bg:"#1a0505",text:"#fca5a5"},
    CANCELLED:{bg:"#0f0f1a",text:"#5a5a8a"},
  },
  light: {
    OPEN:{bg:"#dbeafe",text:"#1d4ed8"},
    ACKNOWLEDGED:{bg:"#dcfce7",text:"#15803d"},
    "IN PROGRESS":{bg:"#e0f2fe",text:"#0369a1"},
    "PENDING CLIENT":{bg:"#f3e8ff",text:"#7c3aed"},
    RESOLVED:{bg:"#dcfce7",text:"#15803d"},
    CLOSED:{bg:"#f1f5f9",text:"#64748b"},
    ESCALATED:{bg:"#fff7ed",text:"#c2410c"},
    "SLA BREACHED":{bg:"#fee2e2",text:"#b91c1c"},
    CANCELLED:{bg:"#f1f5f9",text:"#94a3b8"},
  },
};

// ── Runtime theme state ───────────────────────────────────────────────────────

const _savedTheme = localStorage.getItem('tb_theme') || 'neon';
const _initial = THEMES[_savedTheme] || THEMES.neon;

export const C = { ..._initial };
export const P = { ...(PRIORITY_THEMES[_savedTheme] || PRIORITY_THEMES.neon) };
export const ST = { ...(STATUS_THEMES[_savedTheme] || STATUS_THEMES.neon) };

export function applyTheme(name) {
  const theme = THEMES[name] || THEMES.neon;
  const p = PRIORITY_THEMES[name] || PRIORITY_THEMES.neon;
  const st = STATUS_THEMES[name] || STATUS_THEMES.neon;
  Object.assign(C, theme);
  Object.assign(P, p);
  Object.assign(ST, st);
  localStorage.setItem('tb_theme', name);
}

export const AGENTS = ["Sam Riley","Jamie Lee","Priya Patel","Marcus Webb"];
export const STAFF_ROLES = ["AGENT","SENIOR_AGENT","TEAM_MANAGER","SYSTEM_ADMIN"];
export const SIDEBAR_W = 220;
export const ORG_USERS = [
  {id:"u1",name:"Alice Chen",email:"alice@acmecorp.com",dept:"Engineering"},
  {id:"u2",name:"David Park",email:"david@acmecorp.com",dept:"Finance"},
  {id:"u3",name:"Sarah Kim",email:"sarah@acmecorp.com",dept:"HR"},
  {id:"u4",name:"Tom Walsh",email:"tom@acmecorp.com",dept:"Marketing"},
  {id:"u5",name:"Raj Patel",email:"raj@acmecorp.com",dept:"IT"},
];
