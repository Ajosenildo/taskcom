-- CRIAÇÃO DAS SEQUÊNCIAS (CONTADORES)
CREATE SEQUENCE public.cargos_id_seq;
CREATE SEQUENCE public.comentarios_tarefa_id_seq;
CREATE SEQUENCE public.condominios_id_seq;
CREATE SEQUENCE public.empresas_id_seq;
CREATE SEQUENCE public.grupos_id_seq;
CREATE SEQUENCE public.modelos_tarefa_id_seq;
CREATE SEQUENCE public.segmentos_id_seq;
CREATE SEQUENCE public.tarefa_historico_id_seq;
CREATE SEQUENCE public.tarefas_id_seq;
CREATE SEQUENCE public.tipos_tarefa_id_seq;

-- Tabela para Cargos/Funções dos usuários
CREATE TABLE public.cargos (
    id int8 NOT NULL PRIMARY KEY DEFAULT nextval('cargos_id_seq'::regclass),
    nome_cargo text NOT NULL,
    is_admin bool NOT NULL DEFAULT false,
    empresa_id int8 NOT NULL
);

-- Tabela para Comentários em tarefas
CREATE TABLE public.comentarios_tarefa (
    id int8 NOT NULL PRIMARY KEY DEFAULT nextval('comentarios_tarefa_id_seq'::regclass),
    empresa_id int8 NOT NULL,
    conteudo text NOT NULL,
    tarefa_id int8,
    usuario_id uuid,
    created_at timestamptz DEFAULT now()
);

-- Tabela para Condomínios ou Unidades de Negócio
CREATE TABLE public.condominios (
    id int8 NOT NULL PRIMARY KEY DEFAULT nextval('condominios_id_seq'::regclass),
    empresa_id int8 NOT NULL,
    nome text NOT NULL,
    endereco text,
    superlogica_id text,
    created_at timestamptz DEFAULT now(),
    nome_fantasia text,
    cnpj text,
    grupo_id int8
);

-- Tabela para Empresas clientes do sistema
CREATE TABLE public.empresas (
    id int8 NOT NULL PRIMARY KEY DEFAULT nextval('empresas_id_seq'::regclass),
    nome_empresa text NOT NULL,
    cnpj text,
    created_at timestamptz DEFAULT now(),
    responsavel text,
    email text,
    telefone text,
    segmento_id int8
);

-- Tabela para Grupos (ex: Filiais)
CREATE TABLE public.grupos (
    id int8 NOT NULL PRIMARY KEY DEFAULT nextval('grupos_id_seq'::regclass),
    created_at timestamptz DEFAULT now(),
    nome_grupo text NOT NULL,
    empresa_id int8 NOT NULL
);

-- Tabela para Modelos de Tarefa
CREATE TABLE public.modelos_tarefa (
    id int8 NOT NULL PRIMARY KEY DEFAULT nextval('modelos_tarefa_id_seq'::regclass),
    empresa_id int8 NOT NULL,
    titulo text NOT NULL,
    tipo_tarefa_id int8,
    criador_id uuid
);

-- Tabela para Notificações
CREATE TABLE public.notificacoes (
    id int8 NOT NULL PRIMARY KEY,
    created_at timestamptz DEFAULT now(),
    user_id uuid NOT NULL,
    tarefa_id int4,
    mensagem text NOT NULL,
    lida bool DEFAULT false
);

-- Tabela para Segmentos de Mercado
CREATE TABLE public.segmentos (
    id int8 NOT NULL PRIMARY KEY DEFAULT nextval('segmentos_id_seq'::regclass),
    nome_segmento text NOT NULL,
    empresa_id int8
);

-- Tabela para Histórico de Eventos da Tarefa
CREATE TABLE public.tarefa_historico (
    id int8 NOT NULL PRIMARY KEY DEFAULT nextval('tarefa_historico_id_seq'::regclass),
    tarefa_id int8 NOT NULL,
    usuario_id uuid,
    evento text NOT NULL,
    detalhes jsonb,
    created_at timestamptz DEFAULT now()
);

-- Tabela Principal de Tarefas
CREATE TABLE public.tarefas (
    id int8 NOT NULL PRIMARY KEY DEFAULT nextval('tarefas_id_seq'::regclass),
    empresa_id int8 NOT NULL,
    titulo text NOT NULL,
    descricao text,
    status text NOT NULL DEFAULT 'pending'::text,
    data_criacao timestamptz DEFAULT now(),
    data_conclusao_prevista date NOT NULL,
    criador_id uuid,
    responsavel_id uuid,
    condominio_id int8,
    tipo_tarefa_id int8,
    data_conclusao timestamptz
);

-- Tabela para Tipos de Tarefa
CREATE TABLE public.tipos_tarefa (
    id int8 NOT NULL PRIMARY KEY DEFAULT nextval('tipos_tarefa_id_seq'::regclass),
    nome_tipo text NOT NULL,
    cor text,
    empresa_id int8 NOT NULL
);

-- Tabela para associar Usuários a Grupos
CREATE TABLE public.usuario_grupo (
    usuario_id uuid NOT NULL,
    grupo_id int8 NOT NULL,
    PRIMARY KEY (usuario_id, grupo_id)
);

-- Tabela de Usuários
CREATE TABLE public.usuarios (
    id uuid NOT NULL PRIMARY KEY,
    empresa_id int8 NOT NULL,
    nome_completo text,
    cargo_id int8,
    condominio_id int8,
    ativo bool NOT NULL DEFAULT true,
    email text
);
