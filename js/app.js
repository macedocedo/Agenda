/**
 * Agendamento Preciso - Aplicação Principal
 * Integração completa com Supabase (Auth, Database, Realtime)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================
// CONFIGURAÇÃO E INICIALIZAÇÃO
// ============================================

// Verificar configuração do Supabase
const SUPABASE_CONFIG = window.SUPABASE_CONFIG || {
    url: '',
    anonKey: ''
};

if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey || SUPABASE_CONFIG.url.includes('SEU-PROJETO')) {
    console.warn('⚠️ Configure suas credenciais do Supabase no index.html (window.SUPABASE_CONFIG)');
}

// Cliente Supabase
const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    },
    realtime: {
        params: {
            eventsPerSecond: 10
        }
    }
});

// Estado global da aplicação
const state = {
    user: null,
    profile: null,
    session: null,
    resources: [],
    appointments: [],
    notifications: [],
    settings: {},
    currentView: 'week',
    currentDate: new Date(),
    selectedResourceIds: [],
    selectedStatuses: ['pending', 'confirmed', 'cancelled'],
    sidebarOpen: false,
    realtimeChannels: new Map(),
    dragInfo: null
};

// Elementos DOM cacheados
const els = {};

// ============================================
// UTILITÁRIOS
// ============================================

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const formatDate = (date, options = {}) => {
    const defaultOptions = { timeZone: 'America/Sao_Paulo', ...options };
    return new Intl.DateTimeFormat('pt-BR', defaultOptions).format(date);
};

const formatTime = (date) => formatDate(date, { hour: '2-digit', minute: '2-digit' });

const formatDateTime = (date) => formatDate(date, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
});

const parseLocalDateTime = (str) => {
    // Converte string datetime-local para Date no timezone local
    return new Date(str);
};

const toISOStringLocal = (date) => {
    // Converte Date para string ISO mantendo o timezone local
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, -1);
};

const startOfDay = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
};

const endOfDay = (date) => {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
};

const startOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    return startOfDay(d);
};

const endOfWeek = (date) => {
    const d = startOfWeek(date);
    d.setDate(d.getDate() + 6);
    return endOfDay(d);
};

const addDays = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
};

const addWeeks = (date, weeks) => addDays(date, weeks * 7);

const addMonths = (date, months) => {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
};

const isSameDay = (a, b) => a.toDateString() === b.toDateString();

const isToday = (date) => isSameDay(date, new Date());

const generateId = () => crypto.randomUUID();

const debounce = (fn, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
};

const throttle = (fn, limit) => {
    let inThrottle;
    return (...args) => {
        if (!inThrottle) {
            fn(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

// ============================================
// TOAST NOTIFICATIONS
// ============================================

function showToast(message, type = 'info', duration = 4000) {
    const container = $('#toast-container');
    if (!container) return;

    const icons = {
        success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
        error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.info}</div>
        <span class="toast-message">${message}</span>
        <button class="toast-close" aria-label="Fechar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    container.appendChild(toast);

    if (duration > 0) {
        setTimeout(() => toast.remove(), duration);
    }
}

// ============================================
// MODAL MANAGEMENT
// ============================================

const modals = {
    open(overlayId) {
        const overlay = $(`#${overlayId}`);
        if (overlay) {
            overlay.classList.remove('hidden');
            // Foco no primeiro elemento focável
            setTimeout(() => {
                const focusable = overlay.querySelector('input, select, textarea, button:not(.modal-close)');
                if (focusable) focusable.focus();
            }, 100);
            document.body.style.overflow = 'hidden';
        }
    },

    close(overlayId) {
        const overlay = $(`#${overlayId}`);
        if (overlay) {
            overlay.classList.add('hidden');
            document.body.style.overflow = '';
        }
    },

    closeAll() {
        $$('.modal-overlay').forEach(o => o.classList.add('hidden'));
        document.body.style.overflow = '';
    }
};

// ============================================
// CONFIRMATION MODAL
// ============================================

function confirmAction(message, onConfirm, options = {}) {
    const overlay = $('#confirm-modal-overlay');
    const title = $('#confirm-modal-title');
    const body = $('#confirm-modal-body');
    const okBtn = $('.confirm-ok', overlay);
    const cancelBtn = $('.confirm-cancel', overlay);

    title.textContent = options.title || 'Confirmar ação';
    body.innerHTML = `<p>${message}</p>`;
    okBtn.textContent = options.confirmText || 'Confirmar';
    okBtn.className = `btn ${options.danger ? 'btn-danger' : 'btn-primary'} confirm-ok`;

    const cleanup = () => {
        modals.close('confirm-modal-overlay');
        okBtn.removeEventListener('click', handleOk);
        cancelBtn.removeEventListener('click', handleCancel);
    };

    const handleOk = () => {
        cleanup();
        onConfirm();
    };

    const handleCancel = () => cleanup();

    okBtn.addEventListener('click', handleOk);
    cancelBtn.addEventListener('click', handleCancel);

    modals.open('confirm-modal-overlay');
}

// ============================================
// AUTENTICAÇÃO
// ============================================

async function initAuth() {
    // Verificar sessão existente
    const { data: { session } } = await supabase.auth.getSession();
    state.session = session;

    if (session) {
        await loadUserProfile(session.user.id);
        showMainApp();
    } else {
        showAuthScreen();
    }

    // Listener de mudanças de auth
    supabase.auth.onAuthStateChange(async (event, session) => {
        state.session = session;
        if (event === 'SIGNED_IN' && session) {
            await loadUserProfile(session.user.id);
            showMainApp();
            setupRealtime();
        } else if (event === 'SIGNED_OUT') {
            state.user = null;
            state.profile = null;
            state.resources = [];
            state.appointments = [];
            cleanupRealtime();
            showAuthScreen();
        } else if (event === 'TOKEN_REFRESHED' && session) {
            state.session = session;
        }
    });

    setupAuthForms();
}

async function loadUserProfile(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Erro ao carregar perfil:', error);
        return;
    }

    state.user = { id: userId, email: data?.email };
    state.profile = data || { id: userId, email: state.session?.user?.email };

    updateUserUI();
}

function updateUserUI() {
    const nameEl = $('#user-name');
    const avatarEl = $('#user-avatar');
    const dropdownName = $('.dropdown-name');
    const dropdownEmail = $('.dropdown-email');
    const dropdownAvatar = $('.dropdown-avatar');

    const displayName = state.profile?.full_name || state.user?.email?.split('@')[0] || 'Usuário';
    const email = state.profile?.email || state.user?.email;

    if (nameEl) nameEl.textContent = displayName;
    if (dropdownName) dropdownName.textContent = displayName;
    if (dropdownEmail) dropdownEmail.textContent = email;

    const avatarUrl = state.profile?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`;
    [avatarEl, dropdownAvatar].forEach(el => {
        if (el) el.src = avatarUrl;
    });
}

function showAuthScreen() {
    $('#auth-screen').classList.remove('hidden');
    $('#main-app').classList.add('hidden');
    $('#app-loader').classList.add('hidden');
}

function showMainApp() {
    $('#auth-screen').classList.add('hidden');
    $('#main-app').classList.remove('hidden');
    $('#app-loader').classList.add('hidden');
    initializeApp();
}

function setupAuthForms() {
    // Alternar tabs
    $$('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            $$('.auth-tab').forEach(t => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            $$('.auth-panel').forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');
            $(`#${tab.getAttribute('aria-controls')}`).classList.add('active');
        });
    });

    // Toggle senha
    $$('.password-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = btn.previousElementSibling;
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            btn.querySelector('.icon-eye').classList.toggle('hidden');
            btn.querySelector('.icon-eye-off').classList.toggle('hidden');
            btn.setAttribute('aria-label', isPassword ? 'Ocultar senha' : 'Mostrar senha');
        });
    });

    // Força da senha
    $('#register-password')?.addEventListener('input', (e) => {
        const strength = calculatePasswordStrength(e.target.value);
        const bar = $('.strength-bar span');
        const text = $('.strength-text');
        if (bar) {
            bar.className = strength.level;
            bar.style.width = strength.percent + '%';
        }
        if (text) text.textContent = strength.label;
    });

    // Login form
    $('#login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const btn = $('#login-btn');
        const email = form.email.value.trim();
        const password = form.password.value;

        setButtonLoading(btn, true);

        const { error } = await supabase.auth.signInWithPassword({ email, password });

        setButtonLoading(btn, false);

        if (error) {
            showFormError(form, 'email', error.message);
            showToast(error.message, 'error');
        }
    });

    // Register form
    $('#register-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const btn = $('#register-btn');
        const email = form.email.value.trim();
        const password = form.password.value;
        const confirmPassword = form.confirm_password.value;
        const fullName = form.full_name.value.trim();

        if (password !== confirmPassword) {
            showFormError(form, 'confirm_password', 'As senhas não coincidem');
            return;
        }

        if (password.length < 8) {
            showFormError(form, 'password', 'A senha deve ter pelo menos 8 caracteres');
            return;
        }

        setButtonLoading(btn, true);

        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { full_name: fullName }
            }
        });

        setButtonLoading(btn, false);

        if (error) {
            showFormError(form, 'email', error.message);
            showToast(error.message, 'error');
        } else {
            showToast('Conta criada! Verifique seu e-mail para confirmar.', 'success');
        }
    });

    // Social login
    $$('.social-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const provider = btn.dataset.provider;
            const { error } = await supabase.auth.signInWithOAuth({
                provider,
                options: { redirectTo: window.location.origin }
            });
            if (error) showToast(error.message, 'error');
        });
    });

    // Forgot password
    $('#forgot-password')?.addEventListener('click', async (e) => {
        e.preventDefault();
        const email = prompt('Digite seu e-mail para recuperar a senha:');
        if (email) {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin
            });
            if (error) showToast(error.message, 'error');
            else showToast('E-mail de recuperação enviado!', 'success');
        }
    });
}

function calculatePasswordStrength(password) {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    const levels = ['weak', 'weak', 'fair', 'good', 'strong', 'strong'];
    const labels = ['Muito fraca', 'Fraca', 'Regular', 'Boa', 'Forte', 'Muito forte'];
    const percents = [10, 25, 40, 60, 80, 100];

    const level = levels[Math.min(score, 5)];
    return {
        level,
        label: labels[Math.min(score, 5)],
        percent: percents[Math.min(score, 5)]
    };
}

function showFormError(form, fieldName, message) {
    const input = form.querySelector(`[name="${fieldName}"]`);
    const errorEl = input?.parentElement?.querySelector('.form-error');
    if (input) input.classList.add('error');
    if (errorEl) errorEl.textContent = message;

    input?.addEventListener('input', () => {
        input.classList.remove('error');
        if (errorEl) errorEl.textContent = '';
    }, { once: true });
}

function setButtonLoading(btn, loading) {
    if (!btn) return;
    const text = btn.querySelector('.btn-text');
    const loader = btn.querySelector('.btn-loader');
    btn.disabled = loading;
    if (text) text.classList.toggle('hidden', loading);
    if (loader) loader.classList.toggle('hidden', !loading);
}

// ============================================
// INICIALIZAÇÃO DO APP PRINCIPAL
// ============================================

async function initializeApp() {
    cacheElements();
    setupEventListeners();
    await loadInitialData();
    renderCurrentView();
    setupRealtime();
}

function cacheElements() {
    // Topbar
    els.sidebarToggle = $('#sidebar-toggle');
    els.viewButtons = $$('.view-btn');
    els.navPrev = $('#nav-prev');
    els.navNext = $('#nav-next');
    els.navToday = $('#nav-today');
    els.currentDate = $('#current-date');
    els.newAppointmentBtn = $('#new-appointment-btn');
    els.notificationBtn = $('#notification-btn');
    els.userMenuTrigger = $('#user-menu-trigger');
    els.userDropdown = $('#user-dropdown');
    els.searchInput = $('#global-search');

    // Sidebar
    els.sidebar = $('#sidebar');
    els.sidebarOverlay = $('#sidebar-overlay');
    els.resourceList = $('#resource-list');
    els.upcomingList = $('#upcoming-list');
    els.connectionStatus = $('#connection-status');
    els.connectionText = $('#connection-text');

    // Calendar views
    els.timeGridView = $('#time-grid-view');
    els.monthView = $('#month-view');
    els.scheduleView = $('#schedule-view');
    els.daysHeader = $('#days-header');
    els.timeColumn = $('#time-column');
    els.daysGrid = $('#days-grid');
    els.allDayRow = $('#all-day-row');
    els.allDayCells = $('#all-day-cells');
    els.monthGrid = $('#month-grid');
    els.scheduleList = $('#schedule-list');
    els.emptyState = $('#empty-state');
    els.emptyStateBtn = $('#empty-state-btn');

    // Modals
    els.appointmentModal = $('#appointment-modal');
    els.appointmentForm = $('#appointment-form');
    els.appointmentTitle = $('#appointment-modal-title');
    els.appointmentResource = $('#appointment-resource');
    els.notificationsModal = $('#notifications-modal');
    els.notificationsList = $('#notifications-list');

    // Contadores
    els.countAll = $('#count-all');
    els.countPending = $('#count-pending');
    els.countConfirmed = $('#count-confirmed');
    els.countCancelled = $('#count-cancelled');
}

function setupEventListeners() {
    // Sidebar toggle
    els.sidebarToggle?.addEventListener('click', toggleSidebar);
    els.sidebarOverlay?.addEventListener('click', closeSidebar);

    // View switcher
    els.viewButtons.forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // Navigation
    els.navPrev?.addEventListener('click', () => navigate(-1));
    els.navNext?.addEventListener('click', () => navigate(1));
    els.navToday?.addEventListener('click', () => navigateToToday());

    // New appointment
    els.newAppointmentBtn?.addEventListener('click', () => openAppointmentModal());
    els.emptyStateBtn?.addEventListener('click', () => openAppointmentModal());

    // User menu
    els.userMenuTrigger?.addEventListener('click', toggleUserMenu);
    document.addEventListener('click', (e) => {
        if (!els.userMenuTrigger?.contains(e.target) && !els.userDropdown?.contains(e.target)) {
            closeUserMenu();
        }
    });

    // User dropdown actions
    $$('.dropdown-item[data-action]', els.userDropdown).forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const action = item.dataset.action;
            if (action === 'logout') handleLogout();
            closeUserMenu();
        });
    });

    // Notifications
    els.notificationBtn?.addEventListener('click', openNotificationsModal);
    $('#mark-all-read')?.addEventListener('click', markAllNotificationsRead);

    // Appointment modal
    $('.modal-close', els.appointmentModal)?.addEventListener('click', () => modals.close('appointment-modal-overlay'));
    $('#appointment-cancel')?.addEventListener('click', () => modals.close('appointment-modal-overlay'));
    $('#appointment-delete')?.addEventListener('click', deleteCurrentAppointment);
    els.appointmentForm?.addEventListener('submit', saveAppointment);

    // Recurrence options
    $$('input[name="recurrence"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const custom = $('#recurrence-custom');
            const weekly = $('#weekly-days');
            custom.classList.toggle('hidden', e.target.value === 'none');
            weekly.classList.toggle('hidden', e.target.value !== 'weekly');
        });
    });

    // All day checkbox
    $('#appointment-all-day')?.addEventListener('change', (e) => {
        const startInput = $('#appointment-start');
        const endInput = $('#appointment-end');
        if (e.target.checked) {
            startInput.type = 'date';
            endInput.type = 'date';
        } else {
            startInput.type = 'datetime-local';
            endInput.type = 'datetime-local';
        }
    });

    // Search
    els.searchInput?.addEventListener('input', debounce(filterAppointments, 300));

    // Resource filters (delegation)
    els.resourceList?.addEventListener('change', (e) => {
        if (e.target.matches('input[name="resource-filter"]')) {
            updateResourceFilters();
        }
    });

    // Status filters
    $$('.status-option input').forEach(input => {
        input.addEventListener('change', updateStatusFilters);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // Modal overlay clicks
    $$('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) modals.close(overlay.id);
        });
    });
}

async function loadInitialData() {
    showLoading(true);
    try {
        await Promise.all([
            loadResources(),
            loadSettings(),
            loadAppointmentsForCurrentView(),
            loadNotifications()
        ]);
        updateCounts();
        renderResources();
        renderUpcoming();
    } catch (error) {
        console.error('Erro ao carregar dados iniciais:', error);
        showToast('Erro ao carregar dados', 'error');
    } finally {
        showLoading(false);
    }
}

function showLoading(show) {
    const loader = $('#app-loader');
    if (loader) loader.classList.toggle('hidden', !show);
}

// ============================================
// DADOS - RECURSOS
// ============================================

async function loadResources() {
    const { data, error } = await supabase
        .from('resources')
        .select('*')
        .eq('is_active', true)
        .order('name');

    if (error) throw error;
    state.resources = data || [];

    // Por padrão, selecionar todos
    state.selectedResourceIds = state.resources.map(r => r.id);
}

function renderResources() {
    if (!els.resourceList) return;

    const allOption = els.resourceList.querySelector('.filter-option');
    els.resourceList.innerHTML = '';

    // Recriar opção "Todos"
    const allLabel = document.createElement('label');
    allLabel.className = 'filter-option';
    allLabel.innerHTML = `
        <input type="checkbox" name="resource-filter" value="all" ${state.selectedResourceIds.length === state.resources.length ? 'checked' : ''}>
        <span class="filter-color" style="background: var(--color-primary)"></span>
        <span>Todos</span>
    `;
    els.resourceList.appendChild(allLabel);

    state.resources.forEach(resource => {
        const label = document.createElement('label');
        label.className = 'filter-option';
        const isSelected = state.selectedResourceIds.includes(resource.id);
        label.innerHTML = `
            <input type="checkbox" name="resource-filter" value="${resource.id}" ${isSelected ? 'checked' : ''}>
            <span class="filter-color" style="background: ${resource.color}"></span>
            <span>${resource.name}</span>
        `;
        els.resourceList.appendChild(label);
    });
}

function updateResourceFilters() {
    const checkboxes = $$('input[name="resource-filter"]', els.resourceList);
    const allCheckbox = checkboxes.find(c => c.value === 'all');

    if (allCheckbox.checked) {
        checkboxes.forEach(c => c.checked = true);
        state.selectedResourceIds = state.resources.map(r => r.id);
    } else {
        state.selectedResourceIds = Array.from(checkboxes)
            .filter(c => c.checked && c.value !== 'all')
            .map(c => c.value);
        allCheckbox.checked = state.selectedResourceIds.length === state.resources.length;
    }

    renderCurrentView();
    renderUpcoming();
}

// ============================================
// DADOS - CONFIGURAÇÕES
// ============================================

async function loadSettings() {
    const { data, error } = await supabase.from('settings').select('*');
    if (error) throw error;

    state.settings = {};
    data?.forEach(s => {
        try {
            state.settings[s.key] = JSON.parse(s.value);
        } catch {
            state.settings[s.key] = s.value;
        }
    });
}

function getSetting(key, defaultValue) {
    return state.settings[key] ?? defaultValue;
}

// ============================================
// DADOS - AGENDAMENTOS
// ============================================

async function loadAppointmentsForCurrentView() {
    let start, end;

    switch (state.currentView) {
        case 'day':
            start = startOfDay(state.currentDate);
            end = endOfDay(state.currentDate);
            break;
        case 'week':
            start = startOfWeek(state.currentDate);
            end = endOfWeek(state.currentDate);
            break;
        case 'month':
            start = startOfDay(new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1));
            end = endOfDay(new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 0));
            break;
        case 'schedule':
            start = startOfDay(state.currentDate);
            end = addDays(start, 30); // Próximos 30 dias
            break;
    }

    const { data, error } = await supabase
        .from('appointments')
        .select(`
            *,
            resources (id, name, color, type)
        `)
        .in('resource_id', state.selectedResourceIds.length > 0 ? state.selectedResourceIds : ['00000000-0000-0000-0000-000000000000'])
        .in('status', state.selectedStatuses)
        .gte('start_time', start.toISOString())
        .lte('start_time', end.toISOString())
        .order('start_time', { ascending: true });

    if (error) throw error;
    state.appointments = data || [];
}

async function createAppointment(appointmentData) {
    const { data, error } = await supabase
        .from('appointments')
        .insert([{
            ...appointmentData,
            user_id: state.user.id
        }])
        .select(`
            *,
            resources (id, name, color, type)
        `)
        .single();

    if (error) throw error;

    // Criar agendamentos recorrentes se necessário
    if (appointmentData.recurrence_rule) {
        await createRecurringAppointments(data, appointmentData);
    }

    return data;
}

async function createRecurringAppointments(parentAppointment, formData) {
    const occurrences = calculateRecurrenceOccurrences(
        new Date(formData.start_time),
        new Date(formData.end_time),
        formData.recurrence_rule,
        formData.recurrence_end ? new Date(formData.recurrence_end) : null,
        formData.recurrence_count
    );

    const appointments = occurrences.map((occ, index) => ({
        title: formData.title,
        description: formData.description,
        resource_id: formData.resource_id,
        user_id: state.user.id,
        start_time: occ.start.toISOString(),
        end_time: occ.end.toISOString(),
        status: formData.status,
        recurrence_parent_id: parentAppointment.id,
        metadata: formData.metadata
    }));

    if (appointments.length > 0) {
        const { error } = await supabase.from('appointments').insert(appointments);
        if (error) console.error('Erro ao criar recorrentes:', error);
    }
}

function calculateRecurrenceOccurrences(start, end, rule, until, count) {
    const occurrences = [];
    const duration = end.getTime() - start.getTime();
    let current = new Date(start);
    let generated = 0;
    const maxOccurrences = count || 365;
    const maxDate = until || addMonths(start, 12);

    while (current <= maxDate && generated < maxOccurrences) {
        if (rule === 'daily' || (rule === 'weekly' && current.getDay() === start.getDay()) ||
            (rule === 'monthly' && current.getDate() === start.getDate())) {
            occurrences.push({
                start: new Date(current),
                end: new Date(current.getTime() + duration)
            });
            generated++;
        }
        current = addDays(current, 1);
    }

    return occurrences;
}

async function updateAppointment(id, updates) {
    const { data, error } = await supabase
        .from('appointments')
        .update(updates)
        .eq('id', id)
        .select(`
            *,
            resources (id, name, color, type)
        `)
        .single();

    if (error) throw error;
    return data;
}

async function deleteAppointment(id, deleteSeries = false) {
    if (deleteSeries) {
        // Deletar pai e todos os filhos
        const { error } = await supabase
            .from('appointments')
            .delete()
            .or(`id.eq.${id},recurrence_parent_id.eq.${id}`);
        if (error) throw error;
    } else {
        const { error } = await supabase
            .from('appointments')
            .delete()
            .eq('id', id);
        if (error) throw error;
    }
}

function filterAppointments() {
    const query = els.searchInput?.value.toLowerCase() || '';
    if (!query) {
        renderCurrentView();
        return;
    }

    const filtered = state.appointments.filter(apt =>
        apt.title.toLowerCase().includes(query) ||
        apt.description?.toLowerCase().includes(query) ||
        apt.resources?.name.toLowerCase().includes(query)
    );

    renderAppointments(filtered);
}

// ============================================
// DADOS - NOTIFICAÇÕES
// ============================================

async function loadNotifications() {
    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', state.user.id)
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) throw error;
    state.notifications = data || [];
}

async function markNotificationRead(id) {
    const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);
    if (error) throw error;
}

async function markAllNotificationsRead() {
    const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', state.user.id)
        .is('read_at', null);
    if (error) throw error;

    state.notifications.forEach(n => n.read_at = new Date().toISOString());
    renderNotifications();
    updateNotificationBadge();
}

function updateNotificationBadge() {
    const badge = $('.notification-badge');
    const unreadCount = state.notifications.filter(n => !n.read_at).length;
    if (badge) {
        badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        badge.classList.toggle('hidden', unreadCount === 0);
    }
}

// ============================================
// REALTIME
// ============================================

function setupRealtime() {
    // Canal para agendamentos
    const appointmentsChannel = supabase
        .channel('appointments_changes')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'appointments',
            filter: `user_id=eq.${state.user.id}`
        }, handleRealtimeAppointment)
        .subscribe();

    // Canal para notificações
    const notificationsChannel = supabase
        .channel('notifications_changes')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${state.user.id}`
        }, handleRealtimeNotification)
        .subscribe();

    // Canal para recursos (mudanças de admin)
    const resourcesChannel = supabase
        .channel('resources_changes')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'resources'
        }, () => loadResources().then(renderResources))
        .subscribe();

    state.realtimeChannels.set('appointments', appointmentsChannel);
    state.realtimeChannels.set('notifications', notificationsChannel);
    state.realtimeChannels.set('resources', resourcesChannel);

    updateConnectionStatus(true);
}

function cleanupRealtime() {
    state.realtimeChannels.forEach(channel => {
        supabase.removeChannel(channel);
    });
    state.realtimeChannels.clear();
    updateConnectionStatus(false);
}

function handleRealtimeAppointment(payload) {
    console.log('Realtime appointment:', payload);

    switch (payload.eventType) {
        case 'INSERT':
            state.appointments.push(payload.new);
            break;
        case 'UPDATE':
            const updateIndex = state.appointments.findIndex(a => a.id === payload.new.id);
            if (updateIndex >= 0) {
                state.appointments[updateIndex] = payload.new;
            } else if (isAppointmentInView(payload.new)) {
                state.appointments.push(payload.new);
            }
            break;
        case 'DELETE':
            state.appointments = state.appointments.filter(a => a.id !== payload.old.id);
            break;
    }

    renderCurrentView();
    renderUpcoming();
    updateCounts();
}

function handleRealtimeNotification(payload) {
    console.log('Realtime notification:', payload);
    state.notifications.unshift(payload.new);
    updateNotificationBadge();
    if (!$('#notifications-modal-overlay').classList.contains('hidden')) {
        renderNotifications();
    }
    showToast(`Nova notificação: ${payload.new.title}`, 'info');
}

function isAppointmentInView(appointment) {
    const start = new Date(appointment.start_time);
    let viewStart, viewEnd;

    switch (state.currentView) {
        case 'day':
            viewStart = startOfDay(state.currentDate);
            viewEnd = endOfDay(state.currentDate);
            break;
        case 'week':
            viewStart = startOfWeek(state.currentDate);
            viewEnd = endOfWeek(state.currentDate);
            break;
        case 'month':
            viewStart = startOfDay(new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1));
            viewEnd = endOfDay(new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 0));
            break;
        default:
            return false;
    }

    return start >= viewStart && start <= viewEnd &&
           state.selectedResourceIds.includes(appointment.resource_id) &&
           state.selectedStatuses.includes(appointment.status);
}

function updateConnectionStatus(connected) {
    if (els.connectionStatus) {
        els.connectionStatus.classList.toggle('online', connected);
        els.connectionStatus.classList.toggle('offline', !connected);
    }
    if (els.connectionText) {
        els.connectionText.textContent = connected ? 'Tempo real ativo' : 'Desconectado';
    }
}

// ============================================
// RENDERIZAÇÃO - VIEWS
// ============================================

function switchView(view) {
    state.currentView = view;

    els.viewButtons.forEach(btn => {
        const isActive = btn.dataset.view === view;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive);
    });

    $$('.calendar-view').forEach(v => v.classList.remove('active'));
    $(`#${view === 'day' || view === 'week' ? 'time-grid-view' : view === 'month' ? 'month-view' : 'schedule-view'}`)?.classList.add('active');

    updateCurrentDateDisplay();
    loadAppointmentsForCurrentView().then(() => {
        renderCurrentView();
        renderUpcoming();
    });
}

function navigate(direction) {
    switch (state.currentView) {
        case 'day':
            state.currentDate = addDays(state.currentDate, direction);
            break;
        case 'week':
            state.currentDate = addWeeks(state.currentDate, direction);
            break;
        case 'month':
            state.currentDate = addMonths(state.currentDate, direction);
            break;
        case 'schedule':
            state.currentDate = addDays(state.currentDate, direction * 7);
            break;
    }
    updateCurrentDateDisplay();
    loadAppointmentsForCurrentView().then(renderCurrentView);
}

function navigateToToday() {
    state.currentDate = new Date();
    updateCurrentDateDisplay();
    loadAppointmentsForCurrentView().then(renderCurrentView);
}

function updateCurrentDateDisplay() {
    if (!els.currentDate) return;

    let text = '';
    switch (state.currentView) {
        case 'day':
            text = formatDate(state.currentDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            break;
        case 'week':
            const weekStart = startOfWeek(state.currentDate);
            const weekEnd = endOfWeek(state.currentDate);
            text = `${formatDate(weekStart, { day: 'numeric', month: 'short' })} - ${formatDate(weekEnd, { day: 'numeric', month: 'short', year: 'numeric' })}`;
            break;
        case 'month':
            text = formatDate(state.currentDate, { month: 'long', year: 'numeric' });
            break;
        case 'schedule':
            text = `Próximos 30 dias a partir de ${formatDate(state.currentDate, { day: 'numeric', month: 'long' })}`;
            break;
    }
    els.currentDate.textContent = text.charAt(0).toUpperCase() + text.slice(1);
}

function renderCurrentView() {
    switch (state.currentView) {
        case 'day':
        case 'week':
            renderTimeGrid();
            break;
        case 'month':
            renderMonthView();
            break;
        case 'schedule':
            renderScheduleView();
            break;
    }

    // Mostrar/ocultar empty state
    const hasAppointments = state.appointments.length > 0;
    if (els.emptyState) els.emptyState.classList.toggle('hidden', hasAppointments);
}

function renderTimeGrid() {
    const isWeek = state.currentView === 'week';
    const daysCount = isWeek ? 7 : 1;
    const startDate = isWeek ? startOfWeek(state.currentDate) : state.currentDate;

    // Header dos dias
    els.daysHeader.innerHTML = '';
    for (let i = 0; i < daysCount; i++) {
        const date = addDays(startDate, i);
        const isTodayDate = isToday(date);
        const dayHeader = document.createElement('div');
        dayHeader.className = `day-header${isTodayDate ? ' today' : ''}`;
        dayHeader.setAttribute('role', 'columnheader');
        dayHeader.innerHTML = `
            <div class="day-name">${formatDate(date, { weekday: 'short' })}</div>
            <div class="day-date">${date.getDate()}</div>
        `;
        els.daysHeader.appendChild(dayHeader);
    }

    // Coluna de horários
    const slotDuration = getSetting('slot_duration_minutes', 30);
    const businessStart = getSetting('business_hours_start', '08:00');
    const businessEnd = getSetting('business_hours_end', '18:00');
    const [startHour] = businessStart.split(':').map(Number);
    const [endHour] = businessEnd.split(':').map(Number);
    const totalSlots = ((endHour - startHour) * 60) / slotDuration;

    els.timeColumn.innerHTML = '';
    for (let i = 0; i <= totalSlots; i++) {
        const slotDate = new Date(startDate);
        slotDate.setHours(startHour, 0, 0, 0);
        slotDate.setMinutes(slotDate.getMinutes() + i * slotDuration);

        const slot = document.createElement('div');
        slot.className = 'time-slot';
        slot.dataset.time = slotDate.toISOString();
        slot.textContent = formatTime(slotDate);
        els.timeColumn.appendChild(slot);
    }

    // Grid de dias
    els.daysGrid.innerHTML = '';
    for (let i = 0; i < daysCount; i++) {
        const date = addDays(startDate, i);
        const isTodayDate = isToday(date);
        const dayColumn = document.createElement('div');
        dayColumn.className = `day-column${isTodayDate ? ' today' : ''}`;
        dayColumn.dataset.date = date.toISOString().split('T')[0];

        // Criar slots de tempo
        for (let s = 0; s < totalSlots; s++) {
            const cell = document.createElement('div');
            cell.className = 'time-slot-cell';
            cell.dataset.slotIndex = s;
            dayColumn.appendChild(cell);
        }

        els.daysGrid.appendChild(dayColumn);
    }

    // Linha "Dia todo"
    const hasAllDay = state.appointments.some(a => a.metadata?.all_day);
    els.allDayRow.classList.toggle('hidden', !hasAllDay);
    if (!hasAllDay) return;

    els.allDayCells.innerHTML = '';
    for (let i = 0; i < daysCount; i++) {
        const cell = document.createElement('div');
        cell.className = 'all-day-cell';
        cell.dataset.date = addDays(startDate, i).toISOString().split('T')[0];
        els.allDayCells.appendChild(cell);
    }

    // Renderizar agendamentos
    renderAppointments(state.appointments);
}

function renderAppointments(appointments) {
    const slotDuration = getSetting('slot_duration_minutes', 30);
    const businessStart = getSetting('business_hours_start', '08:00');
    const [startHour] = businessStart.split(':').map(Number);

    // Limpar agendamentos existentes
    $$('.appointment', els.daysGrid).forEach(el => el.remove());
    $$('.all-day-appointment', els.allDayCells).forEach(el => el.remove());

    appointments.forEach(appointment => {
        const start = new Date(appointment.start_time);
        const end = new Date(appointment.end_time);
        const isAllDay = appointment.metadata?.all_day;

        // Verificar se está na view atual
        const dayColumn = els.daysGrid.querySelector(`[data-date="${start.toISOString().split('T')[0]}"]`);
        if (!dayColumn) return;

        if (isAllDay) {
            const allDayCell = els.allDayCells.querySelector(`[data-date="${start.toISOString().split('T')[0]}"]`);
            if (allDayCell) {
                const el = createAppointmentElement(appointment, true);
                allDayCell.appendChild(el);
            }
            return;
        }

        // Calcular posição e altura
        const startMinutes = (start.getHours() - startHour) * 60 + start.getMinutes();
        const endMinutes = (end.getHours() - startHour) * 60 + end.getMinutes();
        const top = (startMinutes / slotDuration) * 60; // 60px por slot
        const height = Math.max(30, ((endMinutes - startMinutes) / slotDuration) * 60);

        const el = createAppointmentElement(appointment, false);
        el.style.top = `${top}px`;
        el.style.height = `${height}px`;

        dayColumn.appendChild(el);
    });
}

function createAppointmentElement(appointment, isAllDay) {
    const el = document.createElement('div');
    el.className = `appointment ${appointment.status}`;
    el.dataset.id = appointment.id;
    el.style.backgroundColor = appointment.resources?.color || 'var(--color-primary)';

    const start = new Date(appointment.start_time);
    const end = new Date(appointment.end_time);

    el.innerHTML = `
        <div class="appointment-title">${escapeHtml(appointment.title)}</div>
        ${!isAllDay ? `<div class="appointment-time">${formatTime(start)} - ${formatTime(end)}</div>` : ''}
    `;

    el.addEventListener('click', (e) => {
        e.stopPropagation();
        openAppointmentModal(appointment);
    });

    return el;
}

function renderMonthView() {
    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay(); // 0 = Domingo
    const daysInMonth = lastDay.getDate();
    const prevMonthLastDay = new Date(year, month, 0).getDate();

    // Cabeçalhos dos dias da semana
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    let html = weekdays.map(d => `<div class="month-day-header">${d}</div>`).join('');

    // Dias do mês anterior (preenchimento)
    for (let i = startDay - 1; i >= 0; i--) {
        const day = prevMonthLastDay - i;
        html += `<div class="month-day other-month"><div class="month-day-number">${day}</div></div>`;
    }

    // Dias do mês atual
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const isTodayDate = isToday(date);
        const dayAppointments = state.appointments.filter(a =>
            isSameDay(new Date(a.start_time), date)
        ).slice(0, 3);

        const moreCount = state.appointments.filter(a =>
            isSameDay(new Date(a.start_time), date)
        ).length - 3;

        html += `
            <div class="month-day${isTodayDate ? ' today' : ''}" data-date="${date.toISOString().split('T')[0]}">
                <div class="month-day-number">${day}</div>
                <div class="month-appointments">
                    ${dayAppointments.map(a => `
                        <div class="month-appointment" style="background: ${a.resources?.color || 'var(--color-primary)'}" data-id="${a.id}">
                            ${escapeHtml(a.title)}
                        </div>
                    `).join('')}
                    ${moreCount > 0 ? `<div class="month-more">+${moreCount} mais</div>` : ''}
                </div>
            </div>
        `;
    }

    // Dias do próximo mês (preenchimento)
    const totalCells = startDay + daysInMonth;
    const remainingCells = (7 - (totalCells % 7)) % 7;
    for (let day = 1; day <= remainingCells; day++) {
        html += `<div class="month-day other-month"><div class="month-day-number">${day}</div></div>`;
    }

    els.monthGrid.innerHTML = html;

    // Event listeners nos agendamentos
    $$('.month-appointment', els.monthGrid).forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const apt = state.appointments.find(a => a.id === el.dataset.id);
            if (apt) openAppointmentModal(apt);
        });
    });

    // Click no dia para novo agendamento
    $$('.month-day:not(.other-month)', els.monthGrid).forEach(day => {
        day.addEventListener('click', () => {
            const date = new Date(day.dataset.date);
            openAppointmentModal(null, date);
        });
    });
}

function renderScheduleView() {
    // Agrupar por dia
    const grouped = {};
    state.appointments.forEach(apt => {
        const date = new Date(apt.start_time).toISOString().split('T')[0];
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(apt);
    });

    const sortedDates = Object.keys(grouped).sort();

    els.scheduleList.innerHTML = sortedDates.map(date => {
        const appointments = grouped[date];
        const dateObj = new Date(date);
        const isTodayDate = isToday(dateObj);

        return `
            <div class="schedule-day${isTodayDate ? ' today' : ''}" data-date="${date}">
                <div class="schedule-day-header">
                    <span class="schedule-day-name">${formatDate(dateObj, { weekday: 'long' })}</span>
                    <span class="schedule-day-date">${dateObj.getDate()}</span>
                </div>
                <div class="schedule-appointments">
                    ${appointments.map(apt => `
                        <div class="schedule-appointment ${apt.status}" data-id="${apt.id}" style="border-left-color: ${apt.resources?.color || 'var(--color-primary)'}">
                            <div class="schedule-appt-time">${formatTime(new Date(apt.start_time))} - ${formatTime(new Date(apt.end_time))}</div>
                            <div class="schedule-appt-details">
                                <div class="schedule-appt-title">${escapeHtml(apt.title)}</div>
                                <div class="schedule-appt-meta">
                                    ${apt.resources ? `<span class="schedule-appt-resource" style="--resource-color: ${apt.resources.color}">${escapeHtml(apt.resources.name)}</span>` : ''}
                                    <span class="schedule-appt-status">${getStatusLabel(apt.status)}</span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('') || '<div class="empty-state" style="padding: var(--space-8);">Nenhum agendamento encontrado</div>';

    // Event listeners
    $$('.schedule-appointment', els.scheduleList).forEach(el => {
        el.addEventListener('click', () => {
            const apt = state.appointments.find(a => a.id === el.dataset.id);
            if (apt) openAppointmentModal(apt);
        });
    });
}

function renderUpcoming() {
    if (!els.upcomingList) return;

    const now = new Date();
    const upcoming = state.appointments
        .filter(a => new Date(a.start_time) > now && a.status !== 'cancelled')
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
        .slice(0, 5);

    if (upcoming.length === 0) {
        els.upcomingList.innerHTML = '<div class="empty-state" style="padding: var(--space-4);">Nenhum agendamento futuro</div>';
        return;
    }

    els.upcomingList.innerHTML = upcoming.map(apt => `
        <div class="upcoming-item" data-id="${apt.id}">
            <div class="upcoming-time">${formatTime(new Date(apt.start_time))}</div>
            <div class="upcoming-details">
                <div class="upcoming-title">${escapeHtml(apt.title)}</div>
                <div class="upcoming-resource">${apt.resources?.name || 'Sem recurso'}</div>
            </div>
        </div>
    `).join('');

    $$('.upcoming-item', els.upcomingList).forEach(el => {
        el.addEventListener('click', () => {
            const apt = state.appointments.find(a => a.id === el.dataset.id);
            if (apt) openAppointmentModal(apt);
        });
    });
}

function updateCounts() {
    const counts = { all: 0, pending: 0, confirmed: 0, cancelled: 0 };
    state.appointments.forEach(apt => {
        counts.all++;
        if (counts[apt.status] !== undefined) counts[apt.status]++;
    });

    if (els.countAll) els.countAll.textContent = counts.all;
    if (els.countPending) els.countPending.textContent = counts.pending;
    if (els.countConfirmed) els.countConfirmed.textContent = counts.confirmed;
    if (els.countCancelled) els.countCancelled.textContent = counts.cancelled;
}

function renderNotifications() {
    if (!els.notificationsList) return;

    const activeTab = $('.notif-tab.active')?.dataset.tab || 'all';
    const filtered = activeTab === 'unread'
        ? state.notifications.filter(n => !n.read_at)
        : state.notifications;

    if (filtered.length === 0) {
        els.notificationsList.innerHTML = '<div style="padding: var(--space-6); text-align: center; color: var(--text-tertiary);">Nenhuma notificação</div>';
        return;
    }

    els.notificationsList.innerHTML = filtered.map(notif => `
        <div class="notification-item${notif.read_at ? '' : ' unread'}" data-id="${notif.id}">
            <div class="notification-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    ${getNotificationIcon(notif.type)}
                </svg>
            </div>
            <div class="notification-content">
                <div class="notification-title">${escapeHtml(notif.title)}</div>
                ${notif.message ? `<div class="notification-message">${escapeHtml(notif.message)}</div>` : ''}
                <div class="notification-time">${formatDateTime(new Date(notif.created_at))}</div>
            </div>
        </div>
    `).join('');

    $$('.notification-item', els.notificationsList).forEach(el => {
        el.addEventListener('click', async () => {
            const id = el.dataset.id;
            if (!el.classList.contains('unread')) return;
            await markNotificationRead(id);
            el.classList.remove('unread');
            updateNotificationBadge();
        });
    });
}

function getNotificationIcon(type) {
    const icons = {
        reminder: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
        confirmation: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
        cancellation: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
        modification: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
        system: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'
    };
    return icons[type] || icons.system;
}

function getStatusLabel(status) {
    const labels = {
        pending: 'Pendente',
        confirmed: 'Confirmado',
        cancelled: 'Cancelado',
        completed: 'Concluído',
        no_show: 'Não compareceu'
    };
    return labels[status] || status;
}

// ============================================
// MODAL DE AGENDAMENTO
// ============================================

let currentEditingAppointment = null;

function openAppointmentModal(appointment = null, defaultDate = null) {
    currentEditingAppointment = appointment;
    const form = els.appointmentForm;
    form.reset();

    // Preencher recursos
    const resourceSelect = $('#appointment-resource');
    resourceSelect.innerHTML = '<option value="">Selecione um recurso</option>' +
        state.resources.map(r => `<option value="${r.id}" style="color: ${r.color}">${r.name}</option>`).join('');

    if (appointment) {
        // Editar existente
        $('#appointment-modal-title').textContent = 'Editar Agendamento';
        $('#appointment-id').value = appointment.id;
        $('#appointment-title').value = appointment.title;
        $('#appointment-description').value = appointment.description || '';
        $('#appointment-resource').value = appointment.resource_id || '';
        $('#appointment-status').value = appointment.status;

        const start = new Date(appointment.start_time);
        const end = new Date(appointment.end_time);

        if (appointment.metadata?.all_day) {
            $('#appointment-all-day').checked = true;
            $('#appointment-start').type = 'date';
            $('#appointment-end').type = 'date';
            $('#appointment-start').value = start.toISOString().split('T')[0];
            $('#appointment-end').value = end.toISOString().split('T')[0];
        } else {
            $('#appointment-start').value = toISOStringLocal(start).slice(0, 16);
            $('#appointment-end').value = toISOStringLocal(end).slice(0, 16);
        }

        // Recorrência
        if (appointment.recurrence_parent_id) {
            // É uma ocorrência filha
            $('#appointment-recurrence-parent').value = appointment.recurrence_parent_id;
            $$('input[name="recurrence"]').forEach(r => r.disabled = true);
            $('#recurrence-custom').classList.add('hidden');
        } else if (appointment.recurrence_rule) {
            // É um pai recorrente
            const ruleMap = {
                'FREQ=DAILY': 'daily',
                'FREQ=WEEKLY': 'weekly',
                'FREQ=MONTHLY': 'monthly'
            };
            const ruleValue = ruleMap[appointment.recurrence_rule] || 'custom';
            $(`input[name="recurrence"][value="${ruleValue}"]`).checked = true;
            $('#recurrence-custom').classList.toggle('hidden', ruleValue === 'none');
            $('#weekly-days').classList.toggle('hidden', ruleValue !== 'weekly');
        }

        $('#appointment-delete').classList.remove('hidden');
    } else {
        // Novo agendamento
        $('#appointment-modal-title').textContent = 'Novo Agendamento';
        $('#appointment-id').value = '';
        $('#appointment-recurrence-parent').value = '';
        $('#appointment-status').value = 'pending';
        $('#appointment-delete').classList.add('hidden');

        const date = defaultDate || state.currentDate;
        const start = new Date(date);
        start.setHours(9, 0, 0, 0);
        const end = new Date(start);
        end.setHours(10, 0, 0, 0);

        $('#appointment-start').value = toISOStringLocal(start).slice(0, 16);
        $('#appointment-end').value = toISOStringLocal(end).slice(0, 16);
    }

    modals.open('appointment-modal-overlay');
}

async function saveAppointment(e) {
    e.preventDefault();
    const form = e.target;
    const btn = $('#appointment-save');

    const formData = new FormData(form);
    const isAllDay = formData.get('all_day') === 'on';

    const startStr = formData.get('start_time');
    const endStr = formData.get('end_time');

    let start, end;
    if (isAllDay) {
        start = new Date(startStr + 'T00:00:00');
        end = new Date(endStr + 'T23:59:59');
    } else {
        start = parseLocalDateTime(startStr);
        end = parseLocalDateTime(endStr);
    }

    // Validações
    if (end <= start) {
        showToast('O horário de fim deve ser posterior ao início', 'error');
        return;
    }

    // Verificar conflitos
    const resourceId = formData.get('resource_id');
    if (resourceId) {
        const hasConflict = await checkConflict(resourceId, start, end, currentEditingAppointment?.id);
        if (hasConflict) {
            if (!confirm('Já existe um agendamento neste horário para este recurso. Deseja continuar mesmo assim?')) {
                return;
            }
        }
    }

    const recurrence = formData.get('recurrence');
    let recurrenceRule = null;
    let recurrenceEnd = null;
    let recurrenceCount = null;

    if (recurrence !== 'none') {
        const freqMap = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY' };
        recurrenceRule = `FREQ=${freqMap[recurrence] || 'DAILY'}`;

        if (recurrence === 'weekly') {
            const weekdays = $$('input[name="weekday"]:checked').map(c => c.value);
            if (weekdays.length > 0) {
                const dayMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
                recurrenceRule += `;BYDAY=${weekdays.map(d => dayMap[parseInt(d)]).join(',')}`;
            }
        }

        recurrenceEnd = formData.get('recurrence_end') || null;
        recurrenceCount = parseInt(formData.get('recurrence_count')) || null;
    }

    const appointmentData = {
        title: formData.get('title'),
        description: formData.get('description') || null,
        resource_id: resourceId || null,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: formData.get('status'),
        recurrence_rule: recurrenceRule,
        metadata: { all_day: isAllDay }
    };

    setButtonLoading(btn, true);

    try {
        if (currentEditingAppointment) {
            await updateAppointment(currentEditingAppointment.id, appointmentData);
            showToast('Agendamento atualizado com sucesso', 'success');
        } else {
            await createAppointment(appointmentData);
            showToast('Agendamento criado com sucesso', 'success');
        }

        modals.close('appointment-modal-overlay');
        await loadAppointmentsForCurrentView();
        renderCurrentView();
        renderUpcoming();
        updateCounts();
    } catch (error) {
        console.error('Erro ao salvar:', error);
        showToast(error.message || 'Erro ao salvar agendamento', 'error');
    } finally {
        setButtonLoading(btn, false);
    }
}

async function checkConflict(resourceId, start, end, excludeId = null) {
    const { data, error } = await supabase.rpc('check_appointment_conflict', {
        p_resource_id: resourceId,
        p_start_time: start.toISOString(),
        p_end_time: end.toISOString(),
        p_exclude_id: excludeId
    });

    if (error) {
        console.error('Erro ao verificar conflito:', error);
        return false;
    }
    return data;
}

async function deleteCurrentAppointment() {
    if (!currentEditingAppointment) return;

    const hasChildren = state.appointments.some(a => a.recurrence_parent_id === currentEditingAppointment.id);

    if (hasChildren) {
        confirmAction(
            'Este agendamento tem ocorrências recorrentes. Deseja excluir apenas esta ocorrência ou toda a série?',
            async () => {
                await deleteAppointment(currentEditingAppointment.id, true);
                showToast('Série de agendamentos excluída', 'success');
                await refreshView();
            },
            { title: 'Excluir agendamento recorrente', confirmText: 'Excluir série', danger: true }
        );
    } else {
        confirmAction(
            'Tem certeza que deseja excluir este agendamento?',
            async () => {
                await deleteAppointment(currentEditingAppointment.id);
                showToast('Agendamento excluído', 'success');
                await refreshView();
            },
            { danger: true }
        );
    }
}

async function refreshView() {
    await loadAppointmentsForCurrentView();
    renderCurrentView();
    renderUpcoming();
    updateCounts();
}

// ============================================
// UI INTERACTIONS
// ============================================

function toggleSidebar() {
    state.sidebarOpen = !state.sidebarOpen;
    els.sidebar.classList.toggle('open', state.sidebarOpen);
    els.sidebarOverlay.classList.toggle('hidden', !state.sidebarOpen);
    els.sidebarToggle.setAttribute('aria-expanded', state.sidebarOpen);
}

function closeSidebar() {
    state.sidebarOpen = false;
    els.sidebar.classList.remove('open');
    els.sidebarOverlay.classList.add('hidden');
    els.sidebarToggle.setAttribute('aria-expanded', 'false');
}

function toggleUserMenu() {
    const isOpen = els.userDropdown.classList.toggle('hidden');
    els.userMenuTrigger.setAttribute('aria-expanded', !isOpen);
}

function closeUserMenu() {
    els.userDropdown.classList.add('hidden');
    els.userMenuTrigger.setAttribute('aria-expanded', 'false');
}

async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) showToast(error.message, 'error');
}

function openNotificationsModal() {
    renderNotifications();
    modals.open('notifications-modal-overlay');
    updateNotificationBadge();
}

function handleKeyboardShortcuts(e) {
    // Ignorar se estiver em input
    if (e.target.matches('input, textarea, select')) return;

    switch (e.key) {
        case 'n':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                openAppointmentModal();
            }
            break;
        case 'ArrowLeft':
            if (e.altKey) {
                e.preventDefault();
                navigate(-1);
            }
            break;
        case 'ArrowRight':
            if (e.altKey) {
                e.preventDefault();
                navigate(1);
            }
            break;
        case 't':
            if (e.altKey) {
                e.preventDefault();
                navigateToToday();
            }
            break;
        case '1':
        case '2':
        case '3':
        case '4':
            if (e.altKey) {
                e.preventDefault();
                const views = ['day', 'week', 'month', 'schedule'];
                switchView(views[parseInt(e.key) - 1]);
            }
            break;
        case 'Escape':
            modals.closeAll();
            closeSidebar();
            closeUserMenu();
            break;
        case '/':
            e.preventDefault();
            els.searchInput?.focus();
            break;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// INICIALIZAÇÃO
// ============================================

// Aguardar DOM pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
} else {
    initAuth();
}

// Exportar para debugging global
window.AppDebug = {
    state,
    supabase,
    refreshView,
    showToast
};