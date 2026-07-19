const firebaseConfig = {
  apiKey: "AIzaSyD0JszZui3CNKiaMTz7Ds5EkDh_qtMrUY4",
  authDomain: "revision-hub-app.firebaseapp.com",
  projectId: "revision-hub-app",
  storageBucket: "revision-hub-app.firebasestorage.app",
  messagingSenderId: "190921621258",
  appId: "1:190921621258:web:4091d963e7306cec5f04f3"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

let _appConfig = null;
let _adminCache = {};

async function getAppConfig() {
  if (_appConfig) return _appConfig;
  try {
    const doc = await db.collection('config').doc('app').get();
    _appConfig = doc.exists ? doc.data() : {};
  } catch (e) {
    _appConfig = {};
  }
  return _appConfig;
}

async function isAdmin(user) {
  if (!user) return false;
  const uid = user.uid;
  if (_adminCache[uid] !== undefined) return _adminCache[uid];
  try {
    const doc = await db.collection('users').doc(uid).get();
    const admin = doc.exists && doc.data().role === 'admin';
    _adminCache[uid] = admin;
    return admin;
  } catch (e) {
    return false;
  }
}

function showLoading(el) {
  if (el) el.innerHTML = '<div class="page-loader"><div class="spinner"></div><p>Loading...</p></div>';
}

function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-times-circle' : 'fa-info-circle';
  toast.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function formatCurrency(amount) {
  return 'KES ' + Number(amount).toLocaleString();
}

function formatDate(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getParams() {
  const params = new URLSearchParams(window.location.search);
  const obj = {};
  for (const [key, value] of params) obj[key] = value;
  return obj;
}
