function initTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.innerHTML = theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
  }
}

function initNavbar(user) {
  const nav = document.getElementById('navbar-links');
  if (!nav) return;

  if (user) {
    nav.innerHTML = `
      <li><a href="/dashboard.html" class="${pageActive('dashboard')}"><i class="fas fa-home"></i> Dashboard</a></li>
      <li><a href="/papers.html" class="${pageActive('papers')}"><i class="fas fa-book"></i> Papers</a></li>
      <li><a href="/premium.html" class="${pageActive('premium')}"><i class="fas fa-star"></i> Premium</a></li>
      <li><a href="/vip.html" class="${pageActive('vip')}"><i class="fas fa-crown"></i> VIP</a></li>
      <li><a href="/downloads.html" class="${pageActive('downloads')}"><i class="fas fa-download"></i> Downloads</a></li>
    `;
  } else {
    nav.innerHTML = `
      <li><a href="/login.html" class="${pageActive('login')}"><i class="fas fa-sign-in-alt"></i> Login</a></li>
      <li><a href="/register.html" class="${pageActive('register')}"><i class="fas fa-user-plus"></i> Register</a></li>
    `;
  }
}

function pageActive(page) {
  return window.location.pathname.includes(page) ? 'active' : '';
}

function initMobileMenu() {
  const toggle = document.getElementById('mobile-toggle');
  const nav = document.getElementById('mobile-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => nav.classList.toggle('open'));
  }
}

function initSidebar() {
  const toggle = document.getElementById('sidebar-toggle');
  const sidebar = document.querySelector('.admin-sidebar');
  if (toggle && sidebar) {
    toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  }
}

function requireAuth(callback) {
  auth.onAuthStateChanged(user => {
    if (!user) {
      window.location.href = '/login.html';
      return;
    }
    callback(user);
  });
}

function requireAdmin(callback) {
  auth.onAuthStateChanged(user => {
    if (!user) {
      window.location.href = '/login.html';
      return;
    }
    if (!isAdmin(user)) {
      window.location.href = '/dashboard.html';
      return;
    }
    callback(user);
  });
}

function redirectIfAuth() {
  auth.onAuthStateChanged(user => {
    if (user) {
      if (isAdmin(user)) {
        window.location.href = '/admin/dashboard.html';
      } else {
        window.location.href = '/dashboard.html';
      }
    }
  });
}
