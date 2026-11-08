-- Schema do Supabase para Aplicação de Agendamento Preciso
-- Execute este script no SQL Editor do Supabase Dashboard

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tabela de perfis de usuários (estende auth.users)
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'user')),
    timezone TEXT DEFAULT 'America/Sao_Paulo',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Tabela de recursos/serviços agendáveis (ex: salas, equipamentos, profissionais)
CREATE TABLE public.resources (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL CHECK (type IN ('room', 'equipment', 'person', 'service')),
    capacity INTEGER DEFAULT 1,
    location TEXT,
    color TEXT DEFAULT '#3B82F6', -- Cor para exibição no calendário
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}', -- Campos extras flexíveis
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER resources_updated_at
    BEFORE UPDATE ON public.resources
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Tabela de horários de disponibilidade dos recursos
CREATE TABLE public.resource_availability (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    resource_id UUID REFERENCES public.resources(id) ON DELETE CASCADE NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Domingo
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_recurring BOOLEAN DEFAULT TRUE,
    valid_from DATE DEFAULT CURRENT_DATE,
    valid_until DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para consultas rápidas de disponibilidade
CREATE INDEX idx_resource_availability_resource_day ON public.resource_availability(resource_id, day_of_week);

-- Tabela principal de agendamentos
CREATE TABLE public.appointments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    resource_id UUID REFERENCES public.resources(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
    recurrence_rule TEXT, -- Regra RRULE para agendamentos recorrentes (ex: FREQ=WEEKLY;BYDAY=MO,WE,FR)
    recurrence_parent_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}', -- Campos extras: observações, checklist, etc.
    reminder_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_time_range CHECK (end_time > start_time),
    CONSTRAINT no_overlap_confirmed EXCLUDE USING GIST (
        resource_id WITH =,
        tstzrange(start_time, end_time) WITH &&
    ) WHERE (status IN ('confirmed', 'pending'))
);

CREATE TRIGGER appointments_updated_at
    BEFORE UPDATE ON public.appointments
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Índices para performance
CREATE INDEX idx_appointments_resource_time ON public.appointments(resource_id, start_time, end_time);
CREATE INDEX idx_appointments_user_time ON public.appointments(user_id, start_time);
CREATE INDEX idx_appointments_status ON public.appointments(status);
CREATE INDEX idx_appointments_recurrence_parent ON public.appointments(recurrence_parent_id);

-- Tabela de bloqueios/exceções de horário (feriados, manutenção, indisponibilidade)
CREATE TABLE public.schedule_blocks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    resource_id UUID REFERENCES public.resources(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    is_all_day BOOLEAN DEFAULT FALSE,
    repeat_rule TEXT, -- RRULE para bloqueios recorrentes
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_schedule_blocks_resource_time ON public.schedule_blocks(resource_id, start_time, end_time);

-- Tabela de notificações/lembretes
CREATE TABLE public.notifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('reminder', 'confirmation', 'cancellation', 'modification', 'system')),
    title TEXT NOT NULL,
    message TEXT,
    scheduled_for TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    channels TEXT[] DEFAULT ARRAY['in_app'], -- 'in_app', 'email', 'push', 'sms'
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_scheduled ON public.notifications(user_id, scheduled_for);
CREATE INDEX idx_notifications_pending ON public.notifications(scheduled_for) WHERE sent_at IS NULL;

-- Tabela de configurações do sistema
CREATE TABLE public.settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER settings_updated_at
    BEFORE UPDATE ON public.settings
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Inserir configurações padrão
INSERT INTO public.settings (key, value, description) VALUES
    ('business_hours_start', '"08:00"', 'Horário de início do expediente'),
    ('business_hours_end', '"18:00"', 'Horário de fim do expediente'),
    ('slot_duration_minutes', '30', 'Duração padrão dos slots em minutos'),
    ('max_advance_booking_days', '90', 'Dias máximos para agendamento antecipado'),
    ('min_cancellation_hours', '2', 'Horas mínimas para cancelamento'),
    ('enable_recurring', 'true', 'Permitir agendamentos recorrentes'),
    ('timezone', '"America/Sao_Paulo"', 'Fuso horário padrão do sistema'),
    ('reminder_defaults', '{"1_day": true, "1_hour": true, "15_min": true}', 'Lembretes padrão');

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Profiles: usuários veem apenas seu próprio perfil, admins veem todos
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Resources: todos autenticados veem recursos ativos, admins gerenciam tudo
CREATE POLICY "Authenticated users can view active resources" ON public.resources
    FOR SELECT USING (is_active = TRUE AND auth.role() = 'authenticated');

CREATE POLICY "Admins can manage resources" ON public.resources
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Resource Availability: visível para usuários autenticados
CREATE POLICY "Authenticated users can view availability" ON public.resource_availability
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage availability" ON public.resource_availability
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Appointments: usuários veem seus próprios, admins/managers veem todos do recurso
CREATE POLICY "Users can view own appointments" ON public.appointments
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create own appointments" ON public.appointments
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own pending appointments" ON public.appointments
    FOR UPDATE USING (user_id = auth.uid() AND status IN ('pending', 'confirmed'))
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can cancel own appointments" ON public.appointments
    FOR UPDATE USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid() AND status = 'cancelled');

CREATE POLICY "Managers can view resource appointments" ON public.appointments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "Managers can update resource appointments" ON public.appointments
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

-- Schedule Blocks: visível para autenticados, gerenciável por admins/managers
CREATE POLICY "Authenticated users can view schedule blocks" ON public.schedule_blocks
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Managers can manage schedule blocks" ON public.schedule_blocks
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('admin', 'manager')
        )
    );

-- Notifications: usuários veem apenas suas notificações
CREATE POLICY "Users can view own notifications" ON public.notifications
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can mark own notifications as read" ON public.notifications
    FOR UPDATE USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid() AND read_at IS NOT NULL);

-- Settings: apenas admins podem modificar, todos autenticados podem ler
CREATE POLICY "Authenticated users can view settings" ON public.settings
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage settings" ON public.settings
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- ============================================
-- FUNCTIONS E TRIGGERS AUTOMÁTICOS
-- ============================================

-- Função para criar perfil automaticamente ao registrar usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Função para verificar conflitos de agendamento
CREATE OR REPLACE FUNCTION public.check_appointment_conflict(
    p_resource_id UUID,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_exclude_id UUID DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE
    conflict_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO conflict_count
    FROM public.appointments
    WHERE resource_id = p_resource_id
        AND id IS DISTINCT FROM p_exclude_id
        AND status IN ('confirmed', 'pending')
        AND start_time < p_end_time
        AND end_time > p_start_time;

    RETURN conflict_count > 0;
END;
$$;

-- Função para gerar slots de horário disponíveis
CREATE OR REPLACE FUNCTION public.get_available_slots(
    p_resource_id UUID,
    p_date DATE,
    p_slot_duration_minutes INTEGER DEFAULT 30
)
RETURNS TABLE (
    slot_start TIMESTAMPTZ,
    slot_end TIMESTAMPTZ,
    is_available BOOLEAN
) LANGUAGE plpgsql AS $$
DECLARE
    v_day_of_week INTEGER;
    v_business_start TIME;
    v_business_end TIME;
    v_settings JSONB;
BEGIN
    -- Obter configurações
    SELECT value INTO v_settings FROM public.settings WHERE key = 'business_hours_start';
    v_business_start := (v_settings->>0)::TIME;

    SELECT value INTO v_settings FROM public.settings WHERE key = 'business_hours_end';
    v_business_end := (v_settings->>0)::TIME;

    v_day_of_week := EXTRACT(DOW FROM p_date)::INTEGER;

    -- Verificar disponibilidade do recurso para o dia
    IF NOT EXISTS (
        SELECT 1 FROM public.resource_availability
        WHERE resource_id = p_resource_id
            AND day_of_week = v_day_of_week
            AND (valid_until IS NULL OR valid_until >= p_date)
            AND valid_from <= p_date
    ) THEN
        RETURN QUERY SELECT NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, FALSE WHERE FALSE;
        RETURN;
    END IF;

    -- Verificar bloqueios
    RETURN QUERY
    WITH slots AS (
        SELECT
            generate_series(
                (p_date + v_business_start) AT TIME ZONE (SELECT value->>0 FROM public.settings WHERE key = 'timezone'),
                (p_date + v_business_end) AT TIME ZONE (SELECT value->>0 FROM public.settings WHERE key = 'timezone'),
                (p_slot_duration_minutes || ' minutes')::INTERVAL
            ) AS slot_start
    ),
    slots_with_end AS (
        SELECT
            slot_start,
            slot_start + (p_slot_duration_minutes || ' minutes')::INTERVAL AS slot_end
        FROM slots
    ),
    blocked_slots AS (
        SELECT
            generate_series(
                GREATEST(sb.start_time, (p_date + v_business_start) AT TIME ZONE (SELECT value->>0 FROM public.settings WHERE key = 'timezone')),
                LEAST(sb.end_time, (p_date + v_business_end) AT TIME ZONE (SELECT value->>0 FROM public.settings WHERE key = 'timezone')),
                (p_slot_duration_minutes || ' minutes')::INTERVAL
            ) AS blocked_start
        FROM public.schedule_blocks sb
        WHERE sb.resource_id = p_resource_id
            AND sb.start_time < (p_date + v_business_end) AT TIME ZONE (SELECT value->>0 FROM public.settings WHERE key = 'timezone')
            AND sb.end_time > (p_date + v_business_start) AT TIME ZONE (SELECT value->>0 FROM public.settings WHERE key = 'timezone')
    ),
    booked_slots AS (
        SELECT
            generate_series(
                GREATEST(a.start_time, (p_date + v_business_start) AT TIME ZONE (SELECT value->>0 FROM public.settings WHERE key = 'timezone')),
                LEAST(a.end_time, (p_date + v_business_end) AT TIME ZONE (SELECT value->>0 FROM public.settings WHERE key = 'timezone')),
                (p_slot_duration_minutes || ' minutes')::INTERVAL
            ) AS booked_start
        FROM public.appointments a
        WHERE a.resource_id = p_resource_id
            AND a.status IN ('confirmed', 'pending')
            AND a.start_time < (p_date + v_business_end) AT TIME ZONE (SELECT value->>0 FROM public.settings WHERE key = 'timezone')
            AND a.end_time > (p_date + v_business_start) AT TIME ZONE (SELECT value->>0 FROM public.settings WHERE key = 'timezone')
    )
    SELECT
        swe.slot_start,
        swe.slot_end,
        NOT EXISTS (SELECT 1 FROM blocked_slots bs WHERE bs.blocked_start = swe.slot_start)
        AND NOT EXISTS (SELECT 1 FROM booked_slots bks WHERE bks.booked_start = swe.slot_start) AS is_available
    FROM slots_with_end swe
    ORDER BY swe.slot_start;
END;
$$;

-- Função para limpar agendamentos recorrentes expirados
CREATE OR REPLACE FUNCTION public.cleanup_expired_recurring()
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    -- Marcar agendamentos passados como completed
    UPDATE public.appointments
    SET status = 'completed', updated_at = NOW()
    WHERE status IN ('confirmed', 'pending')
        AND end_time < NOW()
        AND recurrence_parent_id IS NULL;

    -- Limpar notificações antigas (mais de 30 dias)
    DELETE FROM public.notifications
    WHERE created_at < NOW() - INTERVAL '30 days'
        AND read_at IS NOT NULL;
END;
$$;

-- ============================================
-- REALTIME PUBLICATIONS
-- ============================================

-- Habilitar realtime para tabelas principais
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.resources;
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_blocks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ============================================
-- DADOS DE EXEMPLO (OPCIONAL - DESCOMENTE PARA TESTES)
-- ============================================

/*
-- Inserir recursos de exemplo
INSERT INTO public.resources (name, description, type, capacity, location, color) VALUES
    ('Sala de Reunião 1', 'Sala equipada com projetor e videoconferência', 'room', 10, 'Andar 1', '#3B82F6'),
    ('Sala de Reunião 2', 'Sala menor para reuniões rápidas', 'room', 4, 'Andar 1', '#10B981'),
    ('Notebook Dell', 'Notebook para apresentações', 'equipment', 1, 'TI', '#F59E0B'),
    ('Dr. João Silva', 'Clínico Geral', 'person', 1, 'Consultório 1', '#EF4444'),
    ('Massagem Relaxante', 'Sessão de 60 minutos', 'service', 1, 'Spa', '#EC4899');

-- Inserir disponibilidade (Segunda a Sexta, 8h-18h)
INSERT INTO public.resource_availability (resource_id, day_of_week, start_time, end_time)
SELECT id, day, '08:00'::TIME, '18:00'::TIME
FROM public.resources, generate_series(1,5) AS day
WHERE is_active = TRUE;
*/