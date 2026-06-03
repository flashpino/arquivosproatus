// public/js/layout.js — header, toasts, utilitários compartilhados

const NAV_ITEMS = [
  { href: '/dashboard.html', label: 'Dashboard',  icon: 'dashboard'  },
  { href: '/clientes.html',  label: 'Clientes',   icon: 'groups'     },
  { href: '/locais.html',    label: 'Locais',      icon: 'location_on'},
  { href: '/sensores.html',  label: 'Sensores',    icon: 'sensors'    },
  { href: '/contatos.html',  label: 'Contatos',    icon: 'contacts'   },
];

function renderHeader() {
  if (!isLoggedIn()) { window.location.href = '/login.html'; return; }

  const current = window.location.pathname.split('/').pop() || 'dashboard.html';

  const navHtml = NAV_ITEMS.map(item => {
    const page   = item.href.replace('/', '');
    const active = current === page;
    const cls    = active
      ? 'text-industrial-gray-900 border-b-2 py-1'
      : 'text-industrial-gray-500 hover:text-industrial-gray-900 transition-colors py-1';
    return `<a href="${item.href}" class="${cls}" style="${active ? 'border-color:#2563eb' : ''}">${item.label}</a>`;
  }).join('');

  const mobileNav = NAV_ITEMS.map(item => {
    const page   = item.href.replace('/', '');
    const active = current === page;
    const cls    = active
      ? 'text-industrial-gray-900 border-l-2 pl-2'
      : 'text-industrial-gray-500';
    return `<a href="${item.href}" class="${cls}" style="${active ? 'border-color:#2563eb' : ''}">${item.label}</a>`;
  }).join('');

  document.getElementById('site-header').innerHTML = `
    <header class="flex items-center justify-between px-6 py-3 sticky top-0 z-50 shadow-sm"
            style="border-bottom:1px solid #cbd5e1;background:rgba(255,255,255,0.92);backdrop-filter:blur(10px)">
      <div class="flex items-center gap-8">
        <a href="/dashboard.html" class="flex items-center">
          <span class="text-lg font-bold digital-font" style="color:#1e293b">CPD<span style="color:#2563eb">Monitor</span></span>
        </a>
        <nav class="hidden md:flex items-center gap-6 text-xs font-bold uppercase tracking-widest">
          ${navHtml}
        </nav>
      </div>
      <div class="flex items-center gap-3">
        <div class="hidden lg:flex items-center gap-2 px-3 py-1 rounded" style="background:#f1f5f9;border:1px solid #e2e8f0">
          <span class="text-xs font-bold uppercase tracking-widest" style="color:#64748b;font-size:9px">Sistema</span>
          <div class="w-2 h-2 rounded-full status-glow-green" style="background:#16a34a"></div>
        </div>
        <button onclick="handleLogout()"
                class="p-2 rounded transition-all"
                style="background:#fff;border:1px solid #cbd5e1"
                title="Sair">
          <span class="material-symbols-outlined" style="color:#475569;font-size:20px">logout</span>
        </button>
        <button onclick="toggleMobileMenu()"
                class="md:hidden p-2 rounded transition-all"
                style="background:#fff;border:1px solid #cbd5e1">
          <span class="material-symbols-outlined" style="color:#475569;font-size:20px">menu</span>
        </button>
      </div>
    </header>
    <div id="mobile-menu" class="hidden md:hidden px-6 py-4 flex-col gap-4 sticky z-40"
         style="background:#fff;border-bottom:1px solid #cbd5e1;top:61px">
      <nav class="flex flex-col gap-4 text-xs font-bold uppercase tracking-widest">
        ${mobileNav}
      </nav>
      <hr style="border-color:#e2e8f0">
      <button onclick="handleLogout()" class="text-xs font-bold uppercase tracking-widest flex items-center gap-2" style="color:#dc2626">
        <span class="material-symbols-outlined" style="font-size:14px">logout</span> Sair
      </button>
    </div>
  `;
}

function toggleMobileMenu() {
  const m = document.getElementById('mobile-menu');
  m.classList.toggle('hidden');
}

function handleLogout() {
  clearAuth();
  window.location.href = '/login.html';
}

// ── Toasts ───────────────────────────────────────────────────

function showToast(message, type = 'success') {
  const colors = {
    success: { bg: 'rgba(22,163,74,0.1)', border: '#16a34a', text: '#16a34a', icon: 'check_circle' },
    error:   { bg: 'rgba(220,38,38,0.1)', border: '#dc2626', text: '#dc2626', icon: 'error' },
    info:    { bg: 'rgba(37,99,235,0.1)', border: '#2563eb', text: '#2563eb', icon: 'info' },
  };
  const c = colors[type] || colors.info;

  const el = document.createElement('div');
  el.className = 'toast-flash fixed z-50 flex items-center gap-3 p-4 rounded-r shadow-lg';
  el.style.cssText = `
    top: 80px; right: 1.5rem; max-width: 380px;
    background: ${c.bg}; border-left: 4px solid ${c.border};
  `;
  el.innerHTML = `
    <span class="material-symbols-outlined" style="color:${c.text}">${c.icon}</span>
    <p class="text-sm font-bold" style="color:${c.text}">${message}</p>
    <button onclick="this.parentElement.remove()" style="margin-left:auto;color:${c.text};opacity:0.6">
      <span class="material-symbols-outlined" style="font-size:16px">close</span>
    </button>
  `;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.5s ease';
    el.style.opacity    = '0';
    setTimeout(() => el.remove(), 500);
  }, 4000);
}

// ── Modals ───────────────────────────────────────────────────

function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// Close modal on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.add('hidden');
  }
});
// Close on ESC
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
  }
});

// ── Utilities ────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return 'Nunca';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  if (mins <  1) return 'Agora';
  if (mins <  60) return `${mins}min atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs  <  24) return `${hrs}h atrás`;
  return `${Math.floor(hrs/24)}d atrás`;
}

function fmtTemp(v) { return v != null ? parseFloat(v).toFixed(1) + ' °C' : '--'; }
function fmtHum(v)  { return v != null ? parseFloat(v).toFixed(1) + ' %'  : '--'; }

function isOnline(lastSeenAt, thresholdMs = 5 * 60 * 1000) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < thresholdMs;
}

function statusBadge(online) {
  return online
    ? `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-widest" style="background:#dcfce7;color:#166534;border:1px solid #bbf7d0"><div class="w-1.5 h-1.5 rounded-full" style="background:#16a34a"></div>Online</span>`
    : `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-widest" style="background:#fef9c3;color:#854d0e;border:1px solid #fef08a"><div class="w-1.5 h-1.5 rounded-full" style="background:#ca8a04"></div>Offline</span>`;
}

function activeBadge(active) {
  return active
    ? `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-widest" style="background:#dcfce7;color:#166534;border:1px solid #bbf7d0"><div class="w-1.5 h-1.5 rounded-full" style="background:#16a34a"></div>Ativo</span>`
    : `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-widest" style="background:#f1f5f9;color:#475569;border:1px solid #e2e8f0"><div class="w-1.5 h-1.5 rounded-full" style="background:#94a3b8"></div>Inativo</span>`;
}

// Init: render header on every page
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('site-header')) renderHeader();
});
