-- Create user roles enum
create type public.app_role as enum ('admin', 'inventory_manager', 'nurse');

-- Create profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  created_at timestamptz default now() not null
);

-- Create user_roles table
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);

-- Create inventory_items table
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  item_name text not null,
  item_type text not null check (item_type in ('Equipment', 'Consumable')),
  current_stock integer not null check (current_stock >= 0),
  min_required integer not null check (min_required >= 0),
  max_capacity integer not null check (max_capacity >= 0),
  unit_cost decimal(10, 2) not null check (unit_cost >= 0),
  avg_usage_per_day integer not null check (avg_usage_per_day >= 0),
  restock_lead_time integer not null check (restock_lead_time >= 0),
  vendor_name text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Create predictions table
create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.inventory_items(id) on delete cascade not null,
  estimated_demand decimal(10, 2) not null,
  inventory_shortfall decimal(10, 2) not null,
  replenishment_needs decimal(10, 2) not null,
  predicted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now() not null
);

-- Create activity_logs table
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  details jsonb,
  created_at timestamptz default now() not null
);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.inventory_items enable row level security;
alter table public.predictions enable row level security;
alter table public.activity_logs enable row level security;

-- Create security definer function for role checking
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

-- RLS Policies for profiles
create policy "Users can view all profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- RLS Policies for user_roles
create policy "Users can view their own roles"
  on public.user_roles for select
  to authenticated
  using (user_id = auth.uid());

create policy "Admins can manage all roles"
  on public.user_roles for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for inventory_items
create policy "All authenticated users can view inventory"
  on public.inventory_items for select
  to authenticated
  using (true);

create policy "Admins and managers can insert inventory"
  on public.inventory_items for insert
  to authenticated
  with check (
    public.has_role(auth.uid(), 'admin') or 
    public.has_role(auth.uid(), 'inventory_manager')
  );

create policy "Admins and managers can update inventory"
  on public.inventory_items for update
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin') or 
    public.has_role(auth.uid(), 'inventory_manager')
  );

create policy "Admins can delete inventory"
  on public.inventory_items for delete
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for predictions
create policy "All authenticated users can view predictions"
  on public.predictions for select
  to authenticated
  using (true);

create policy "Admins and managers can insert predictions"
  on public.predictions for insert
  to authenticated
  with check (
    public.has_role(auth.uid(), 'admin') or 
    public.has_role(auth.uid(), 'inventory_manager')
  );

-- RLS Policies for activity_logs
create policy "Users can view their own logs"
  on public.activity_logs for select
  to authenticated
  using (user_id = auth.uid());

create policy "Admins can view all logs"
  on public.activity_logs for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "All authenticated users can insert logs"
  on public.activity_logs for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Create trigger for new user profile creation
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'User'),
    new.email
  );
  
  -- Assign default 'nurse' role to new users
  insert into public.user_roles (user_id, role)
  values (new.id, 'nurse');
  
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Create updated_at trigger function
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Add trigger for inventory_items
create trigger update_inventory_updated_at
  before update on public.inventory_items
  for each row
  execute function public.update_updated_at_column();