import { supabase } from './supabaseClient';

// ============================================================
// CERTIFICATE TEMPLATES
// ============================================================
// Admin upload PDF template + tetapkan koordinat field secara visual.
// Template boleh:
// - Per kursus (course.certificate_template_id)
// - Default per scope (negeri/daerah)
// - Global (semua scope)

export interface FieldPosition {
  field: 'leaderName' | 'leaderIC' | 'courseName' | 'courseDate' | 'courseVenue' | 'certificateNo' | 'issueDate' | 'resultGrade';
  page: number;
  x: number;
  y: number;
  fontSize: number;
  fontWeight?: 'normal' | 'bold';
  color?: string; // hex
  align?: 'left' | 'center' | 'right';
  width?: number; // untuk align center/right
}

export interface CertificateTemplate {
  id: string;
  name: string;
  description?: string;
  scope: 'negeri' | 'daerah' | 'global';
  negeriId?: string | null;
  negeriName?: string | null;
  daerahId?: string | null;
  daerahName?: string | null;
  templateUrl: string;
  fieldPositions: FieldPosition[];
  isDefault: boolean;
  isActive: boolean;
  createdByRole?: string;
  createdBy?: string;
  createdAt: string;
}

function mapTemplateRow(row: any): CertificateTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    scope: row.scope,
    negeriId: row.negeri_id,
    negeriName: row.negeri?.name,
    daerahId: row.daerah_id,
    daerahName: row.daerah?.name,
    templateUrl: row.template_url,
    fieldPositions: row.field_positions || [],
    isDefault: row.is_default,
    isActive: row.is_active,
    createdByRole: row.created_by_role,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

// ============================================================
// CRUD
// ============================================================

export interface CreateTemplateInput {
  name: string;
  description?: string;
  scope: 'negeri' | 'daerah' | 'global';
  negeriId?: string | null;
  daerahId?: string | null;
  templateUrl: string;
  fieldPositions: FieldPosition[];
  isDefault?: boolean;
  createdByRole?: string;
  createdBy?: string;
}

export async function createTemplate(input: CreateTemplateInput): Promise<{ success: boolean; template?: CertificateTemplate; message?: string }> {
  try {
    if (input.scope === 'negeri' && !input.negeriId) {
      return { success: false, message: 'Negeri diperlukan untuk scope negeri.' };
    }
    if (input.scope === 'daerah' && !input.daerahId) {
      return { success: false, message: 'Daerah diperlukan untuk scope daerah.' };
    }

    // Jika set sebagai default, unset semua default lain dalam scope yang sama
    if (input.isDefault) {
      await unsetDefaultsInScope(input.scope, input.negeriId, input.daerahId);
    }

    const { data, error } = await supabase
      .from('certificate_templates')
      .insert({
        name: input.name.trim(),
        description: input.description?.trim() || null,
        scope: input.scope,
        negeri_id: input.negeriId || null,
        daerah_id: input.daerahId || null,
        template_url: input.templateUrl,
        field_positions: input.fieldPositions,
        is_default: input.isDefault || false,
        is_active: true,
        created_by_role: input.createdByRole,
        created_by: input.createdBy,
      })
      .select('*, negeri:negeri_id(name), daerah:daerah_id(name)')
      .single();

    if (error || !data) {
      return { success: false, message: error?.message || 'Gagal cipta template.' };
    }
    return { success: true, template: mapTemplateRow(data) };
  } catch (err: any) {
    return { success: false, message: err.message || 'Ralat sistem.' };
  }
}

export async function updateTemplate(
  id: string,
  patch: Partial<CreateTemplateInput>,
): Promise<{ success: boolean; message?: string }> {
  try {
    const update: any = {};
    if (patch.name !== undefined) update.name = patch.name.trim();
    if (patch.description !== undefined) update.description = patch.description?.trim() || null;
    if (patch.templateUrl !== undefined) update.template_url = patch.templateUrl;
    if (patch.fieldPositions !== undefined) update.field_positions = patch.fieldPositions;
    if (patch.isDefault !== undefined) update.is_default = patch.isDefault;
    update.updated_at = new Date().toISOString();

    if (patch.isDefault) {
      const { data: existing } = await supabase
        .from('certificate_templates')
        .select('scope, negeri_id, daerah_id')
        .eq('id', id)
        .single();
      if (existing) {
        await unsetDefaultsInScope(existing.scope, existing.negeri_id, existing.daerah_id);
      }
    }

    const { error } = await supabase.from('certificate_templates').update(update).eq('id', id);
    if (error) return { success: false, message: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message || 'Ralat sistem.' };
  }
}

async function unsetDefaultsInScope(
  scope: 'negeri' | 'daerah' | 'global',
  negeriId?: string | null,
  daerahId?: string | null,
) {
  let query = supabase.from('certificate_templates').update({ is_default: false }).eq('scope', scope);
  if (scope === 'negeri' && negeriId) query = query.eq('negeri_id', negeriId);
  if (scope === 'daerah' && daerahId) query = query.eq('daerah_id', daerahId);
  await query;
}

export async function deleteTemplate(id: string): Promise<{ success: boolean; message?: string }> {
  const { error } = await supabase.from('certificate_templates').delete().eq('id', id);
  if (error) return { success: false, message: error.message };
  return { success: true };
}

// ============================================================
// LIST / RESOLVE
// ============================================================

export interface ListTemplatesFilter {
  scope?: 'negeri' | 'daerah' | 'global';
  negeriId?: string;
  daerahId?: string;
  activeOnly?: boolean;
}

export async function listTemplates(filter: ListTemplatesFilter = {}): Promise<CertificateTemplate[]> {
  let query = supabase
    .from('certificate_templates')
    .select('*, negeri:negeri_id(name), daerah:daerah_id(name)')
    .order('created_at', { ascending: false });

  if (filter.scope) query = query.eq('scope', filter.scope);
  if (filter.negeriId) query = query.eq('negeri_id', filter.negeriId);
  if (filter.daerahId) query = query.eq('daerah_id', filter.daerahId);
  if (filter.activeOnly !== false) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map(mapTemplateRow);
}

export async function getTemplateById(id: string): Promise<CertificateTemplate | null> {
  const { data } = await supabase
    .from('certificate_templates')
    .select('*, negeri:negeri_id(name), daerah:daerah_id(name)')
    .eq('id', id)
    .maybeSingle();
  return data ? mapTemplateRow(data) : null;
}

/**
 * Tentukan template mana yang patut digunakan untuk satu kursus.
 * Cari ikut keutamaan:
 * 1. Kursus ada certificate_template_id sendiri
 * 2. Default template untuk negeri/daerah kursus
 * 3. Default global template
 */
export async function resolveTemplateForCourse(course: {
  id: string;
  scope: 'negeri' | 'daerah';
  negeriId?: string | null;
  daerahId?: string | null;
  certificateTemplateId?: string | null;
}): Promise<CertificateTemplate | null> {
  // 1. Template terus pada kursus
  if (course.certificateTemplateId) {
    const direct = await getTemplateById(course.certificateTemplateId);
    if (direct && direct.isActive) return direct;
  }

  // 2. Default per scope
  if (course.scope === 'negeri' && course.negeriId) {
    const { data } = await supabase
      .from('certificate_templates')
      .select('*, negeri:negeri_id(name), daerah:daerah_id(name)')
      .eq('scope', 'negeri')
      .eq('negeri_id', course.negeriId)
      .eq('is_default', true)
      .eq('is_active', true)
      .maybeSingle();
    if (data) return mapTemplateRow(data);
  }
  if (course.scope === 'daerah' && course.daerahId) {
    const { data } = await supabase
      .from('certificate_templates')
      .select('*, negeri:negeri_id(name), daerah:daerah_id(name)')
      .eq('scope', 'daerah')
      .eq('daerah_id', course.daerahId)
      .eq('is_default', true)
      .eq('is_active', true)
      .maybeSingle();
    if (data) return mapTemplateRow(data);
  }

  // 3. Global default
  const { data: global } = await supabase
    .from('certificate_templates')
    .select('*, negeri:negeri_id(name), daerah:daerah_id(name)')
    .eq('scope', 'global')
    .eq('is_default', true)
    .eq('is_active', true)
    .maybeSingle();
  if (global) return mapTemplateRow(global);

  return null;
}