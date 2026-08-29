'use server';

import ExcelJS from 'exceljs';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth';
import {
  USERS_HEADERS,
  USERS_SHEET_NAME,
  SEATS_HEADERS,
  SEATS_SHEET_NAME,
  validateUserRow,
  validateSeatRow,
  type ParsedUserRow,
  type ParsedSeatRow,
  type RowIssue,
} from '@/lib/master-data/schema';

export interface ParsedImportResult {
  userRows: ParsedUserRow[];
  userIssues: RowIssue[];
  seatRows: ParsedSeatRow[];
  seatIssues: RowIssue[];
  parseError?: string;
}

function sheetToObjects(sheet: ExcelJS.Worksheet | undefined, headers: readonly string[]) {
  const rows: { rowNumber: number; data: Record<string, unknown> }[] = [];
  if (!sheet) return rows;

  const headerRow = sheet.getRow(1);
  const colIndexByHeader = new Map<string, number>();
  headerRow.eachCell((cell, colNumber) => {
    const value = String(cell.value ?? '').trim();
    if (value) colIndexByHeader.set(value, colNumber);
  });

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    if (row.actualCellCount === 0) continue;

    const data: Record<string, unknown> = {};
    let hasAnyValue = false;
    for (const header of headers) {
      const colIndex = colIndexByHeader.get(header);
      const value = colIndex ? row.getCell(colIndex).value : null;
      const plain = value && typeof value === 'object' && 'text' in value ? (value as { text: string }).text : value;
      data[header] = plain;
      if (plain != null && String(plain).trim() !== '') hasAnyValue = true;
    }
    if (hasAnyValue) rows.push({ rowNumber: r, data });
  }

  return rows;
}

export async function parseMasterDataFileAction(formData: FormData): Promise<ParsedImportResult> {
  await requireAdmin();

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { userRows: [], userIssues: [], seatRows: [], seatIssues: [], parseError: 'No file uploaded' };
  }

  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs's Buffer type and this project's @types/node Buffer type
    // structurally disagree (a transitive @types/node version mismatch via
    // exceljs's fast-csv dependency, not an actual runtime issue) — `as any`
    // is the pragmatic escape hatch here; Buffer.from(arrayBuffer) is a real
    // Node Buffer at runtime regardless.
    await workbook.xlsx.load(Buffer.from(arrayBuffer) as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  } catch {
    return {
      userRows: [],
      userIssues: [],
      seatRows: [],
      seatIssues: [],
      parseError: 'Could not read this file — please upload the .xlsx template exported from this app.',
    };
  }

  const supabase = await createClient();
  const [{ data: locations }, { data: existingUsers }, { data: existingSeats }] = await Promise.all([
    supabase.from('locations').select('id, code'),
    supabase.from('users').select('id, email'),
    supabase.from('seats').select('id, seat_number, location_id'),
  ]);

  const locationsByCode = new Map((locations ?? []).map((l) => [l.code.toUpperCase(), { id: l.id }]));
  const seatsByNumber = new Map(
    (existingSeats ?? []).map((s) => [s.seat_number.toUpperCase(), { id: s.id, locationId: s.location_id }])
  );
  const existingUserIds = new Set((existingUsers ?? []).map((u) => u.id.toLowerCase()));
  const existingEmailToId = new Map((existingUsers ?? []).map((u) => [u.email.toLowerCase(), u.id.toLowerCase()]));
  const existingSeatIds = new Set((existingSeats ?? []).map((s) => s.id.toLowerCase()));
  const existingSeatKeyToId = new Map(
    (existingSeats ?? []).map((s) => [`${s.location_id}::${s.seat_number.toUpperCase()}`, s.id.toLowerCase()])
  );

  const userRows: ParsedUserRow[] = [];
  const userIssues: RowIssue[] = [];
  for (const { rowNumber, data } of sheetToObjects(workbook.getWorksheet(USERS_SHEET_NAME), USERS_HEADERS)) {
    const { row, issues } = validateUserRow(data, rowNumber, {
      locationsByCode,
      seatsByNumber,
      existingUserIds,
      existingEmailToId,
    });
    if (row) userRows.push(row);
    userIssues.push(...issues);
  }

  const seatRows: ParsedSeatRow[] = [];
  const seatIssues: RowIssue[] = [];
  for (const { rowNumber, data } of sheetToObjects(workbook.getWorksheet(SEATS_SHEET_NAME), SEATS_HEADERS)) {
    const { row, issues } = validateSeatRow(data, rowNumber, {
      locationsByCode,
      existingSeatIds,
      existingSeatKeyToId,
    });
    if (row) seatRows.push(row);
    seatIssues.push(...issues);
  }

  return { userRows, userIssues, seatRows, seatIssues };
}
