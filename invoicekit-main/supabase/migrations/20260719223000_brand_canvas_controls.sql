alter table public.workspace_branding
  add column if not exists layout_mode text not null default 'single' check(layout_mode in ('single','grid')),
  add column if not exists content_width text not null default 'standard' check(content_width in ('compact','standard','wide')),
  add column if not exists spacing_density text not null default 'comfortable' check(spacing_density in ('compact','comfortable','spacious')),
  add column if not exists corner_style text not null default 'rounded' check(corner_style in ('square','soft','rounded')),
  add column if not exists header_alignment text not null default 'split' check(header_alignment in ('left','split','center')),
  add column if not exists block_widths jsonb not null default '{"header":"full","client":"full","items":"full","totals":"full","payment":"full","terms":"full","approval":"full","footer":"full"}'::jsonb;
