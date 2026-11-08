/**
 * Configuração do Supabase - Helper para carregar credenciais
 * Este arquivo facilita a configuração sem modificar o index.html
 */

// Configuração padrão (substitua pelos seus valores ou use variáveis de ambiente)
const DEFAULT_CONFIG = {
    url: '', // Será preenchido via env ou manualmente
    anonKey: ''
};

// Tentar carregar de variáveis de ambiente (Vite, etc.)
function loadFromEnv() {
    // Vite expõe variáveis com prefixo VITE_ em import.meta.env
    if (typeof import.meta !== 'undefined' && import.meta.env) {
        return {
            url: import.meta.env.VITE_SUPABASE_URL || '',
            anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || ''
        };
    }

    // Fallback para window.ENV (se definido externamente)
    if (window.ENV) {
        return {
            url: window.ENV.SUPABASE_URL || '',
            anonKey: window.ENV.SUPABASE_ANON_KEY || ''
        };
    }

    return { url: '', anonKey: '' };
}

// Carregar configuração
const envConfig = loadFromEnv();
const finalConfig = {
    url: envConfig.url || DEFAULT_CONFIG.url,
    anonKey: envConfig.anonKey || DEFAULT_CONFIG.anonKey
};

// Validar configuração
function validateConfig(config) {
    const errors = [];

    if (!config.url) {
        errors.push('URL do Supabase não configurada');
    } else if (!config.url.startsWith('https://') || !config.url.includes('.supabase.co')) {
        errors.push('URL do Supabase inválida (deve ser https://seu-projeto.supabase.co)');
    }

    if (!config.anonKey) {
        errors.push('Chave anônima (anon key) não configurada');
    } else if (config.anonKey.length < 100) {
        errors.push('Chave anônima parece inválida (muito curta)');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

const validation = validateConfig(finalConfig);

if (!validation.valid) {
    console.warn('⚠️ Configuração do Supabase incompleta:', validation.errors);
    console.info('📝 Configure suas credenciais em uma das formas:');
    console.info('   1. Variáveis de ambiente (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)');
    console.info('   2. Edite js/supabase-config.js e preencha DEFAULT_CONFIG');
    console.info('   3. Defina window.ENV antes de carregar o app');
    console.info('   4. Defina window.SUPABASE_CONFIG no index.html');
}

// Exportar configuração final
window.SUPABASE_CONFIG = finalConfig;

// Exportar para uso em módulos
export const supabaseConfig = finalConfig;
export const isConfigValid = validation.valid;
export const configErrors = validation.errors;