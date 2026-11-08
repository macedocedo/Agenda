# Agendamento Preciso

Sistema de agendamento moderno, responsivo e em tempo real construído com **HTML, CSS, JavaScript (ES Modules)** e **Supabase**.

![Agendamento Preciso](https://img.shields.io/badge/Status-Pronto%20para%20uso-brightgreen)
![Supabase](https://img.shields.io/badge/Supabase-Integrado-3ECF8E)
![License](https://img.shields.io/badge/License-MIT-blue)

https://macedocedo.github.io/Agenda/

## ✨ Funcionalidades

### 📅 Visualizações de Calendário
- **Dia** - Visualização detalhada por horas
- **Semana** - 7 dias com grade de horários
- **Mês** - Calendário mensal com agendamentos
- **Agenda** - Lista cronológica dos próximos eventos

### 🔐 Autenticação Completa
- Login com e-mail/senha
- Cadastro de novos usuários
- Login social (Google, GitHub)
- Recuperação de senha
- Sessão persistente com refresh automático

### 📋 Gestão de Agendamentos
- Criar, editar, excluir agendamentos
- **Agendamentos recorrentes** (diário, semanal, mensal, personalizado)
- Agendamentos de dia todo
- Verificação de conflitos em tempo real
- Status: Pendente, Confirmado, Cancelado, Concluído

### 🎨 Recursos e Filtros
- Múltiplos recursos (salas, equipamentos, profissionais, serviços)
- Cores personalizadas por recurso
- Filtros por recurso e status
- Busca global

### 🔔 Notificações em Tempo Real
- Notificações push via Supabase Realtime
- Lembretes automáticos (1 dia, 1 hora, 15 min)
- Centro de notificações com marcação de lidas

### 🎯 Interface Moderna
- Design system consistente com CSS Custom Properties
- Totalmente responsivo (mobile-first)
- Tema claro/escuro automático
- Acessibilidade (WCAG 2.1 AA)
- Atalhos de teclado

## 🚀 Quick Start

### 1. Pré-requisitos
- Conta no [Supabase](https://supabase.com) (gratuita)
- Node.js 18+ (para servidor de desenvolvimento)
- Navegador moderno

### 2. Configurar Supabase

#### A. Criar projeto
1. Acesse [supabase.com](https://supabase.com) e crie um novo projeto
2. Anote a **URL** e a **Chave Anônima (anon key)** em Settings > API

#### B. Executar Schema SQL
1. No painel do Supabase, vá em **SQL Editor**
2. Copie e cole o conteúdo de `sql/schema.sql`
3. Clique em **Run** para criar todas as tabelas, políticas RLS, funções e triggers

#### C. Configurar Autenticação
1. Em **Authentication > Providers**, habilite:
   - Email (já habilitado por padrão)
   - Google (opcional) - adicione Client ID/Secret
   - GitHub (opcional) - adicione Client ID/Secret
2. Em **Authentication > URL Configuration**:
   - Site URL: `http://localhost:5173` (ou sua URL de produção)
   - Redirect URLs: adicione `http://localhost:5173/**`

### 3. Configurar Aplicação

#### Opção A: Variáveis de Ambiente (Recomendado)
```bash
cp .env.example .env
# Edite .env com suas credenciais
```

#### Opção B: Editar js/supabase-config.js
```javascript
const DEFAULT_CONFIG = {
    url: 'https://seu-projeto.supabase.co',
    anonKey: 'sua-chave-anonima-aqui'
};
```

#### Opção C: Definir no index.html
```html
<script type="module">
    window.SUPABASE_CONFIG = {
        url: 'https://seu-projeto.supabase.co',
        anonKey: 'sua-chave-anonima-aqui'
    };
</script>
```

### 4. Executar

```bash
# Instalar dependências (apenas para dev server)
npm install

# Iniciar servidor de desenvolvimento
npm run dev
# ou
npx serve .
# ou
python -m http.server 8000
```

Acesse `http://localhost:5173` (ou porta indicada).

## 📁 Estrutura do Projeto

```
AgendamentoApp/
├── index.html              # HTML principal
├── .env.example            # Template de configuração
├── README.md               # Este arquivo
├── css/
│   └── main.css            # Estilos completos (Design System)
├── js/
│   ├── app.js              # Aplicação principal
│   └── supabase-config.js  # Helper de configuração
├── sql/
│   └── schema.sql          # Schema completo do Supabase
└── assets/                 # Imagens, ícones (futuro)
```

## ⚙️ Configurações Avançadas

### Personalizar Horários de Expediente
No painel do Supabase, tabela `settings`:

```sql
-- Horário de início (padrão 08:00)
UPDATE settings SET value = '"07:00"' WHERE key = 'business_hours_start';

-- Horário de fim (padrão 18:00)
UPDATE settings SET value = '"19:00"' WHERE key = 'business_hours_end';

-- Duração do slot em minutos (padrão 30)
UPDATE settings SET value = '60' WHERE key = 'slot_duration_minutes';

-- Dias máximos para agendamento antecipado (padrão 90)
UPDATE settings SET value = '180' WHERE key = 'max_advance_booking_days';
```

### Adicionar Recursos Iniciais
```sql
INSERT INTO resources (name, description, type, capacity, location, color) VALUES
    ('Sala de Reunião 1', 'Com projetor e videoconferência', 'room', 10, 'Andar 1', '#3B82F6'),
    ('Sala de Reunião 2', 'Para reuniões rápidas', 'room', 4, 'Andar 1', '#10B981'),
    ('Notebook Dell', 'Para apresentações', 'equipment', 1, 'TI', '#F59E0B'),
    ('Dr. João Silva', 'Clínico Geral', 'person', 1, 'Consultório 1', '#EF4444');

-- Disponibilidade: Seg-Sex 8h-18h
INSERT INTO resource_availability (resource_id, day_of_week, start_time, end_time)
SELECT id, day, '08:00'::TIME, '18:00'::TIME
FROM resources, generate_series(1,5) AS day
WHERE is_active = TRUE;
```

### Configurar Lembretes Personalizados
```sql
UPDATE settings SET value = '{"1_day": true, "2_hours": true, "30_min": true, "at_time": true}'
WHERE key = 'reminder_defaults';
```

## 🎨 Personalização do Tema

### Cores Principais (CSS Custom Properties)
```css
:root {
    --color-primary: #3B82F6;      /* Azul principal */
    --color-primary-hover: #2563EB;
    --color-success: #10B981;       /* Verde */
    --color-warning: #F59E0B;       /* Amarelo */
    --color-danger: #EF4444;        /* Vermelho */
    --color-info: #06B6D4;          /* Ciano */
}
```

### Forçar Tema Claro/Escuro
```html
<!-- No <html> ou via JS -->
<html data-theme="light">  <!-- ou "dark" -->
```

## ⌨️ Atalhos de Teclado

| Atalho | Ação |
|--------|------|
| `Ctrl/Cmd + N` | Novo agendamento |
| `Alt + ←` | Período anterior |
| `Alt + →` | Próximo período |
| `Alt + T` | Ir para hoje |
| `Alt + 1/2/3/4` | Alternar visualização (Dia/Semana/Mês/Agenda) |
| `/` | Focar busca |
| `Esc` | Fechar modais/menus |

## 🔒 Segurança (RLS)

O schema inclui **Row Level Security** completo:

- **Usuários** veem apenas seus próprios agendamentos
- **Managers/Admins** veem agendamentos dos recursos que gerenciam
- **Recursos** visíveis para todos autenticados
- **Configurações** só editáveis por admins
- **Notificações** isoladas por usuário

### Papéis de Usuário
```sql
-- Promover a admin
UPDATE profiles SET role = 'admin' WHERE id = 'uuid-do-usuario';

-- Promover a manager
UPDATE profiles SET role = 'manager' WHERE id = 'uuid-do-usuario';
```

## 📱 PWA (Progressive Web App)

Para transformar em PWA instalável:

1. Crie `manifest.json` na raiz:
```json
{
  "name": "Agendamento Preciso",
  "short_name": "Agenda",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#3B82F6",
  "icons": [
    {"src": "/assets/icon-192.png", "sizes": "192x192", "type": "image/png"},
    {"src": "/assets/icon-512.png", "sizes": "512x512", "type": "image/png"}
  ]
}
```

2. Adicione no `<head>` do index.html:
```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#3B82F6">
```

3. Crie `sw.js` (Service Worker) para cache offline.

## 🌐 Deploy em Produção

### Vercel (Recomendado)
```bash
npm i -g vercel
vercel --prod
```

### Netlify
```bash
npm i -g netlify-cli
netlify deploy --prod --dir .
```

### Configurações de Produção
1. Atualize **Site URL** no Supabase Auth para sua URL de produção
2. Configure variáveis de ambiente no provedor de deploy
3. Habilite HTTPS (obrigatório para auth)
4. Configure domínio personalizado

## 🐛 Troubleshooting

### "Configuração do Supabase incompleta"
- Verifique se `window.SUPABASE_CONFIG` está definido antes do `app.js`
- Confira se URL e anonKey estão corretos
- Veja console do navegador para detalhes

### "Erro ao carregar dados - RLS"
- Verifique se as políticas RLS foram criadas (schema.sql)
- Confirme se usuário está autenticado
- Teste queries diretas no SQL Editor do Supabase

### "Conflito de agendamento não detectado"
- A função `check_appointment_conflict` usa exclusion constraint
- Verifique se a constraint `no_overlap_confirmed` existe na tabela
- Teste: `SELECT * FROM check_appointment_conflict(...)`

### Realtime não funciona
- Verifique se `ALTER PUBLICATION supabase_realtime ADD TABLE ...` foi executado
- Confirme se o canal está inscrito (console: `AppDebug.state.realtimeChannels`)
- Teste no painel do Supabase > Realtime > Logs

### Estilos não carregam
- Verifique se `css/main.css` está acessível
- Confira se há erros 404 no console
- Teste com servidor HTTP (não abra index.html direto no navegador)

## 📄 Licença

MIT License - veja [LICENSE](LICENSE) para detalhes.

## 🤝 Contribuição

1. Fork o projeto
2. Crie branch: `git checkout -b feature/nova-funcionalidade`
3. Commit: `git commit -m 'feat: adiciona nova funcionalidade'`
4. Push: `git push origin feature/nova-funcionalidade`
5. Abra Pull Request

## 📞 Suporte

- **Issues**: [GitHub Issues](https://github.com/seu-usuario/agendamento-preciso/issues)
- **Discussões**: [GitHub Discussions](https://github.com/seu-usuario/agendamento-preciso/discussions)
- **Email**: suporte@seudominio.com

---

**Desenvolvido com ❤️ usando Supabase + Vanilla JS**

*Inspirado na simplicidade e eficácia do projeto [Skate-manobras](https://github.com/macedocedo/Skate-manobras)*
